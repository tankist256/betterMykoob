import type { AbsenceEntry, AbsenceTable, Action, ActivityEntry, DiaryDay, GradeFilters, GradeTable, HomeResource, Lesson, MykoobAdapter, MykoobSnapshot, NavigationItem, Page, SourceSelect, UserContext } from './models';

const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
// Mykoob glues counters to labels without a space ("Задания38", "Файлы225").
const pageTerms: Array<[Page, RegExp]> = [
  ['home', /^(домой|home|sākums)$/i],
  ['diary', /^(дневник|diary|dienasgrāmata)$/i],
  ['grades', /^(оценки|grades|atzīmes)$/i],
  ['absences', /^(пропуски|absences|kavējumi)$/i],
  ['homework', /^(задания|homework|uzdevumi)(\s*\d+)?$/i],
  ['files', /^(файлы|files|faili)(\s*\d+)?$/i],
  ['statistics', /^(статистика|statistics|statistika)$/i],
  ['notifications', /^(уведомления|notifications|paziņojumi)$/i],
  ['report', /^(выписка оценок|grade report|sekmju izraksts)$/i],
];

function identifyPage(url: string): Page {
  if (document.documentElement.dataset.bmPreviewPage) return document.documentElement.dataset.bmPreviewPage as Page;
  const value = decodeURIComponent(url).toLowerCase();
  if (/lessonsplan/.test(value)) return 'diary';
  if (/periodattendance/.test(value)) return 'absences';
  if (/viewgrades|reportperiod/.test(value)) return /reportperiod/.test(value) ? 'report' : 'grades';
  if (/files/.test(value)) return 'files';
  if (/statistic/.test(value)) return 'statistics';
  if (/journal\/notes/.test(value)) return 'notifications';
  if (/homework|task/.test(value)) return 'homework';
  if (/profile/.test(value)) return 'home';
  return 'other';
}

function splitSubject(value: string): Pick<Lesson, 'subject' | 'room' | 'teacher'> {
  const normalized = clean(value);
  const teacherMatch = normalized.match(/\(([^()]*)\)\s*$/);
  const teacher = teacherMatch?.[1] ?? '';
  const withoutTeacher = teacherMatch ? normalized.slice(0, teacherMatch.index).trim() : normalized;
  const separator = withoutTeacher.indexOf(' - ');
  return {
    subject: separator < 0 ? withoutTeacher : withoutTeacher.slice(0, separator),
    room: separator < 0 ? '' : withoutTeacher.slice(separator + 3),
    teacher,
  };
}

function accessibleCellLabel(cell: Element | undefined): string {
  if (!cell) return '';
  const elements = [cell, ...cell.querySelectorAll('*')];
  for (const element of elements) {
    const label = clean(element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('alt') || element.getAttribute('data-original-title'));
    if (label && label.length <= 80) return label;
  }
  return '';
}

function readNavigation(source: HTMLElement): NavigationItem[] {
  const items: NavigationItem[] = [];
  source.querySelectorAll<HTMLAnchorElement>('a').forEach(link => {
    const label = clean(link.textContent);
    const match = pageTerms.find(([, pattern]) => pattern.test(label));
    if (!match || items.some(item => item.page === match[0])) return;
    const count = label.match(/(\d+)$/)?.[1];
    let href = link.href;
    let origin: HTMLAnchorElement | undefined = link;
    if (!href || href.startsWith('javascript:')) {
      // Dropdown tabs (e.g. "Задания") use a void link. Follow their first real subtab instead.
      const sub = link.closest('li')?.querySelector<HTMLAnchorElement>('a[href]:not([href^="javascript"])');
      if (sub && sub !== link) { href = sub.href; origin = undefined; }
    }
    items.push({ page: match[0], label: label.replace(/\s*\d+$/, ''), href, count, source: origin });
  });
  return items;
}

function readUser(source: HTMLElement): UserContext {
  const candidates = [...source.querySelectorAll('*')];
  const context = candidates.find(el => {
    const text = clean(el.textContent);
    return el.children.length === 0 && /mācību gads/.test(text) && /grupa/.test(text) && text.length < 150;
  }) ?? candidates.find(el => {
    const text = clean(el.textContent);
    return el.children.length < 3 && /mācību gads/.test(text) && /grupa/.test(text) && text.length < 150;
  });
  const titleContext = document.title.match(/\[([^\]]*mācību gads)\]/)?.[1] ?? '';
  const label = clean(context?.textContent || titleContext);
  const parts = label.split(',').map(clean);
  // The logout control carries the real name: `Выход Marks Berjozins (mail@...)`.
  const logoutTitle = source.querySelector('.header-opt-logout')?.getAttribute('title') ?? '';
  const logoutName = clean(logoutTitle.replace(/^(выход|logout|iziet)\s+/i, '').replace(/\s*\([^)]*\)\s*$/, ''));
  const nameRow = [...source.querySelectorAll('table tr')].find(row => {
    const value = clean(row.textContent);
    // Action rows like "Распечатать план урока" are 2-3 plain words too, so they
    // must not be mistaken for the student's name (see diary header bug).
    const actionWords = /mykoob|ресурс|новост|действ|печа|распеча|план|урок|отч[её]т|экспорт|export|print|график|консультац|выписк/i;
    return /^[\p{L}]+(?:\s+[\p{L}]+){1,2}$/u.test(value) && !actionWords.test(value);
  });
  return {
    label,
    name: logoutName || clean(nameRow?.textContent || source.querySelector('[title*="рофил"], [aria-label*="рофил"]')?.textContent),
    group: parts.length >= 3 ? parts[1] : label.match(/([^,]+\s+grupa)/)?.[1]?.trim() ?? '',
    academicYear: label.match(/\d{4}\.\s*\/\s*\d{4}\./)?.[0] ?? '',
  };
}

// Legend from #attendance_legend: Mykoob marks attendance with icon-only buttons.
const attendanceClassLabels: Array<[string, string]> = [
  ['uncheck', 'Посещено'],
  ['delete3', 'Опоздание'],
  ['delete4', 'Ушёл раньше'],
  ['delete2', 'Оправданный'],
  ['delete', 'Непосещено'],
  ['blank_gray', 'Несохранено'],
];

function readAttendanceValue(cell: HTMLElement | undefined): string {
  const tokens = cell?.querySelector('button')?.className.split(/\s+/) ?? [];
  return attendanceClassLabels.find(([token]) => tokens.includes(token))?.[1] ?? '';
}

function readHomework(cell: HTMLElement | undefined): string {
  if (!cell) return '';
  const titles = [...cell.querySelectorAll('.assignment_title')].map(element => clean(element.textContent)).filter(Boolean);
  if (titles.length) return titles.join(', ');
  return clean(cell.textContent).replace(/^\*\s*/, '');
}

function readDiary(source: HTMLElement): DiaryDay[] {
  const days: DiaryDay[] = [];
  const headings = [...source.querySelectorAll('h2')];
  source.querySelectorAll<HTMLTableElement>('table').forEach(table => {
    const heading = [...headings].reverse().find(node => Boolean(node.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING));
    const date = clean(heading?.textContent);
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) return;
    const lessons: Lesson[] = [];
    table.querySelectorAll<HTMLTableRowElement>('tr').forEach(row => {
      const cellElements = [...row.querySelectorAll<HTMLTableCellElement>('td')];
      const cells = cellElements.map(cell => clean(cell.textContent));
      if (cells.length < 7 || !/^\d+\.?$/.test(cells[0]) || !/\d{2}:\d{2}/.test(cells[1])) return;
      lessons.push({
        number: cells[0], time: cells[1], ...splitSubject(cells[2]), grade: readGradeValues(cellElements[3]),
        attendance: readAttendanceValue(cellElements[4]) || cells[4] || accessibleCellLabel(cellElements[4]),
        homework: readHomework(cellElements[5]), topic: cells[6] ?? '',
        feedback: cells[7] || accessibleCellLabel(cellElements[7]), feedbackAction: Boolean(cellElements[7]?.children.length), sourceRow: row,
      });
    });
    if (lessons.length) days.push({ date, lessons });
  });
  return days;
}

function readDateControl(source: HTMLElement): MykoobSnapshot['dateControl'] {
  const range = /\d{2}\.\d{2}\.\d{4}\s*[-–]\s*\d{2}\.\d{2}\.\d{4}/;
  const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    if (!/\d{2}\.\d{2}\.\d{4}/.test(textNode.textContent || '') || textNode.parentElement?.closest('script,style')) continue;
    let candidate = textNode.parentElement;
    for (let depth = 0; candidate && candidate !== source && depth < 8; depth++, candidate = candidate.parentElement) {
      const textWalker = document.createTreeWalker(candidate, NodeFilter.SHOW_TEXT);
      const pieces: string[] = [];
      while (textWalker.nextNode()) if (!textWalker.currentNode.parentElement?.closest('script,style')) pieces.push(textWalker.currentNode.textContent || '');
      const value = clean(pieces.join(' '));
      if (value.length > 160) continue;
      const label = value.match(range)?.[0];
      const buttons = [...candidate.querySelectorAll<HTMLElement>('button,[role="button"]')];
      if (label && buttons.length >= 2) return { label, previous: buttons[0], next: buttons[1] };
    }
  }
  return null;
}

function readGradeValues(cell: HTMLElement): string {
  const raw = clean(cell.textContent);
  // Mykoob places a JSON tooltip after each visible grade in the same cell.
  // The tooltip contains the task description, type and date, so treating the
  // whole textContent as grades makes those fields appear as extra chips.
  const tooltipBlocks = [...raw.matchAll(/\[\[[\s\S]*?\]\]/g)];
  if (!tooltipBlocks.length) return raw;
  const grades = tooltipBlocks.map(match => {
    try {
      const tooltip = JSON.parse(match[0]) as unknown;
      if (Array.isArray(tooltip) && Array.isArray(tooltip[0])) {
        const value = tooltip[0][0];
        if (typeof value === 'string' || typeof value === 'number') return clean(String(value));
      }
    } catch { /* A malformed tooltip should not break the table. */ }
    return clean(raw.slice(0, match.index).match(/(?:^|\s)(\d+(?:[.,]\d+)?%?)\s*$/)?.[1]);
  }).filter(Boolean);
  return grades.join(', ');
}

function readGrades(source: HTMLElement): GradeTable | null {
  const candidates = [...source.querySelectorAll<HTMLTableElement>('table')];
  const monthPattern = /сентябр|октябр|ноябр|декабр|январ|феврал|март|апрел|ма[йя]|июн|septembr|oktobr|novembr|decembr|janvār|februār|mart|aprīl|maij|jūnij/i;
  const monthTable = candidates.find(candidate => !candidate.querySelector('table') && monthPattern.test(clean(candidate.querySelector('tr')?.textContent)) && [...candidate.querySelectorAll('tr')].length > 1);
  if (!monthTable) return readGradesContentFallback(source);
  const firstMonthRow = monthTable.querySelector('tr');
  const months = firstMonthRow ? [...firstMonthRow.children].map(cell => clean(cell.textContent)) : [];
  const containingRow = monthTable.closest('tr');
  const peers = containingRow ? [...containingRow.children].map(cell => cell.querySelector<HTMLTableElement>('table')).filter((table): table is HTMLTableElement => Boolean(table)) : [];
  const subjectTable = peers.find(table => table !== monthTable && [...table.querySelectorAll('tr')].slice(1).some(row => /\d+\./.test(clean(row.querySelector('td')?.textContent)))) || null;
  const averageTable = peers.find(table => /средн|average|vidēj/i.test(clean(table.querySelector('tr')?.textContent))) || null;

  if (subjectTable) {
    const subjectRows = [...subjectTable.querySelectorAll<HTMLTableRowElement>('tr')].slice(1);
    const monthRows = [...monthTable.querySelectorAll<HTMLTableRowElement>('tr')].slice(1);
    const averageRows = averageTable ? [...averageTable.querySelectorAll<HTMLTableRowElement>('tr')].slice(1) : [];
    const headings = ['Предмет', ...months, ...(averageTable ? ['Среднее'] : [])];
    const rows = subjectRows.map((row, index) => {
      const subjectCells = [...row.querySelectorAll<HTMLElement>('td,th')];
      const monthCells = monthRows[index] ? [...monthRows[index].querySelectorAll<HTMLElement>('td,th')] : [];
      const averageCells = averageRows[index] ? [...averageRows[index].querySelectorAll<HTMLElement>('td,th')] : [];
      const sourceCells = [...monthCells, ...(averageTable ? averageCells.slice(0, 1) : [])];
      return { subject: clean(subjectCells.at(-1)?.textContent), values: sourceCells.map(readGradeValues), sourceCells };
    }).filter(row => row.subject);
    return rows.length ? { headings, rows } : null;
  }

  const headings = ['Предмет', ...months];
  const rows = [...monthTable.querySelectorAll<HTMLTableRowElement>('tr')].slice(1).map(row => {
    const cells = [...row.querySelectorAll<HTMLElement>('td,th')];
    return { subject: clean(cells[0]?.textContent), values: cells.slice(1).map(readGradeValues), sourceCells: cells.slice(1) };
  }).filter(row => row.subject);
  if (rows.length) return { headings, rows };
  return readGradesContentFallback(source);
}

// Tables on period pages nest (summary cells hold inner tables), so plain
// querySelectorAll('tr') mixes outer and inner rows. Keep only direct rows.
function directTableRows(root: Element | null, selector: string): HTMLTableRowElement[] {
  const table = root?.querySelector<HTMLTableElement>(selector);
  if (!table) return [];
  return [...table.querySelectorAll<HTMLTableRowElement>('tr')].filter(row => row.closest('table') === table);
}

// Second attempt for the real #gradesContent layout (subject table + month data
// table side by side, as seen on period pages). Used when the month-table search fails.
function readGradesContentFallback(source: HTMLElement): GradeTable | null {
  const content = source.querySelector('#gradesContent');
  if (!content) return null;
  const subjectRows = directTableRows(content, '.period_subject_div table').slice(1);
  const dataRows = directTableRows(content, '.period_data_div table');
  if (!subjectRows.length || !dataRows.length) return null;
  const months = [...dataRows[0].children].map(cell => clean(cell.textContent)).filter(Boolean);
  if (!months.length) return null;
  const rows = subjectRows.map((row, index) => {
    const cells = [...row.querySelectorAll<HTMLElement>('td,th')];
    const dataCells = dataRows[index + 1] ? [...dataRows[index + 1].children] as HTMLElement[] : [];
    return {
      subject: clean(cells.at(-1)?.textContent),
      values: dataCells.map(readGradeValues),
      sourceCells: dataCells,
    };
  }).filter(row => row.subject);
  return rows.length ? { headings: ['Предмет', ...months], rows } : null;
}

const summaryHeadingNames: Record<string, string> = {
  'Урок': 'Уроки',
  'Отсу': 'Отсутствует',
  'Опра': 'Оправдано',
  'Опоз': 'Опоздания',
  'Ушёл': 'Ушёл раньше',
};

// Parser for the real attendance layout: subject table + month data table with
// status buttons + summary table, all inside #gradesContent.attendance_page.
function readAbsences(source: HTMLElement): AbsenceTable | null {
  const content = source.querySelector('#gradesContent.attendance_page');
  if (!content) return null;
  const subjectRows = directTableRows(content, '.period_subject_div table').slice(1);
  const dataRows = directTableRows(content, '.period_data_div table');
  const summaryRows = directTableRows(content, '.period_summary_table');
  if (!subjectRows.length || dataRows.length < 2) return null;
  const months = [...dataRows[0].children].map(cell => clean(cell.textContent)).filter(Boolean);
  const summaryHeadings = summaryRows.length
    ? [...summaryRows[0].querySelectorAll('a')].map(link => summaryHeadingNames[clean(link.textContent)] ?? clean(link.textContent)).filter(Boolean)
    : [];
  const rows = subjectRows.map((row, index) => {
    const subjectCells = [...row.querySelectorAll<HTMLElement>('td,th')];
    const dataCells = dataRows[index + 1] ? [...dataRows[index + 1].children] : [];
    const entries = dataCells.map(cell => [...cell.querySelectorAll('button')].map(button => {
      const tokens = button.className.split(/\s+/);
      const status = attendanceClassLabels.find(([token]) => tokens.includes(token))?.[1] ?? 'Отметка';
      const title = clean(button.getAttribute('title'));
      const date = title.match(/Дата:\s*([\d.]+\s*[\d:]*)/)?.[1]?.trim() ?? '';
      return { status, date, title };
    }));
    const summaryTable = summaryRows[index + 1]?.querySelector('table');
    const summary = summaryTable ? [...summaryTable.querySelectorAll('td')].map(cell => clean(cell.textContent)) : [];
    return {
      subject: clean(subjectCells.at(-1)?.textContent),
      entries,
      summary,
    };
  }).filter(row => row.subject);
  return rows.length ? { months, summaryHeadings, rows } : null;
}

function readGradeFilters(source: HTMLElement): GradeFilters {
  const dateInputs = [...source.querySelectorAll<HTMLInputElement>('input')].filter(input => /^\d{2}\.\d{2}\.\d{4}$/.test(input.value));
  const findTextControl = (label: string) => {
    // Prefer true leaves: a wrapping <td> also carries the label text, but only
    // the inner control (or its own text node) routes clicks to the real handler.
    const matches = [...source.querySelectorAll<HTMLElement>('a,button,span,div,li,td')].filter(element => clean(element.textContent) === label);
    const leaf = matches.find(element => element.children.length === 0) ?? matches.find(element => element.children.length < 2);
    return leaf?.closest<HTMLElement>('a,button,[role="button"]') || leaf;
  };
  const make = (label: string) => {
    const element = findTextControl(label);
    // The selected period carries the `strong` class (e.g. "Сегодня" in .periodPart).
    return element ? { label, element, active: /active|selected|current|\bstrong\b/i.test(`${element.className} ${element.parentElement?.className}`) || element.getAttribute('aria-selected') === 'true' } : null;
  };
  const quick = ['Сегодня', 'Вчера', '1.sem.', '2.sem.'].map(make).filter((value): value is NonNullable<typeof value> => Boolean(value));
  const types = ['Все оценки', 'Diagnosticējošais darbs', 'Mājas darbs', 'Nodarbība', 'Patstāvīgais darbs', 'Pārbaudes darbs'].map(make).filter((value): value is NonNullable<typeof value> => Boolean(value));
  return { startDate: dateInputs[0], endDate: dateInputs[1], apply: findTextControl('Утвердить'), quick, types };
}

function readActions(source: HTMLElement): Action[] {
  const names = /печать|print|консультац|consult|экспорт|export|отчёт|report|период|семестр|semester/i;
  const actions: Action[] = [];
  source.querySelectorAll<HTMLElement>('button,a,[role="button"]').forEach(element => {
    const label = clean(element.textContent || element.getAttribute('title') || element.getAttribute('aria-label'));
    if (names.test(label) && label.length < 60 && !actions.some(item => item.label === label)) actions.push({ label, element });
  });
  return actions;
}

function readSelects(source: HTMLElement): SourceSelect[] {
  // Closed sub-blocks (e.g. a collapsed print dialog) must not leak their
  // controls into the toolbar. Note: `source` itself is hidden, so only
  // ancestors below it are checked.
  const isHiddenBelowSource = (element: HTMLElement) => {
    for (let node = element.parentElement; node && node !== source; node = node.parentElement) {
      if (node.hidden || node.style.display === 'none') return true;
    }
    return false;
  };
  const seen = new Set<string>();
  const selects: SourceSelect[] = [];
  [...source.querySelectorAll<HTMLSelectElement>('select')].forEach(element => {
    // Dialogs (profile settings, print windows, cookie panels) carry their own
    // controls. They must not flood the page toolbar.
    if (element.hidden || element.style.display === 'none') return;
    if (element.closest('.mykoob-dialog,.ui-dialog,.dialog,[role="dialog"],#Print_Dialog,#cc--main')) return;
    if (isHiddenBelowSource(element)) return;
    const options = [...element.options].map(option => ({ label: clean(option.textContent), value: option.value }));
    if (options.length < 2) return;
    const label = clean(element.getAttribute('aria-label') || element.previousElementSibling?.textContent) || `Выбор ${selects.length + 1}`;
    // Mykoob appends a fresh copy of print dialogs on every repeated click.
    // Show each unique form once instead of flooding the toolbar.
    const fingerprint = `${label}::${options.map(option => `${option.label}=${option.value}`).join('|')}`;
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    selects.push({ label, element, options, value: element.value });
  });
  return selects;
}

function readActivity(source: HTMLElement): ActivityEntry[] {
  const table = [...source.querySelectorAll<HTMLTableElement>('table')]
    .filter(candidate => /Мои действия/.test(clean(candidate.textContent)) && /Сегодня|Вчера/.test(clean(candidate.textContent)))
    .sort((a, b) => (a.textContent?.length ?? 0) - (b.textContent?.length ?? 0))[0];
  if (!table) return [];
  const walker = document.createTreeWalker(table, NodeFilter.SHOW_TEXT);
  const entries: ActivityEntry[] = [];
  let group = '';
  let buffer: string[] = [];
  let sourceElement: HTMLElement = table;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    const fragments = (node.textContent ?? '').split(/\n+/).map(clean).filter(Boolean);
    for (const text of fragments) {
      if (/^(Сегодня|Вчера|\d{2}\.\d{2}\.\d{4})$/.test(text)) { group = text; buffer = []; continue; }
      if (!group || /^(Мои действия|Настройки действий)$/.test(text)) continue;
      if (/^\d{1,2}:\d{2}$/.test(text)) {
        const title = clean(buffer.join(' '));
        if (title) entries.push({ title, detail: text, group, source: sourceElement });
        buffer = [];
        sourceElement = table;
      } else {
        if (!buffer.length && parent) sourceElement = parent;
        buffer.push(text);
      }
    }
  }
  return entries;
}

function readHomeResources(source: HTMLElement): HomeResource[] {
  return ['Mykoob Plus', 'Uzdevumi', 'Новости школы'].map(label => {
    const leaf = [...source.querySelectorAll<HTMLElement>('a,button,span,div,td')].find(element => clean(element.textContent) === label && element.children.length < 2);
    const container = leaf?.closest('tr') || leaf?.parentElement;
    const target = container?.querySelector<HTMLElement>('a,button,[role="button"]') || leaf;
    return target ? { label, source: target } : null;
  }).filter((value): value is HomeResource => Boolean(value));
}

function readProfileImage(source: HTMLElement): string | undefined {
  const image = [...source.querySelectorAll<HTMLImageElement>('table img')].find(img => img.naturalWidth >= 120 && img.naturalHeight >= 120);
  return image?.src;
}

function readEmbeddedFrame(source: HTMLElement): HTMLIFrameElement | null {
  // The statistics page is a single analytics iframe. Reuse the live node so it keeps its state.
  return source.querySelector<HTMLIFrameElement>('#main iframe[src*="analytics"]');
}

export class DomMykoobAdapter implements MykoobAdapter {
  constructor(private source: HTMLElement) {}

  read(): MykoobSnapshot {
    const page = identifyPage(window.location.href);
    const nav = readNavigation(this.source);
    const pageNames: Record<Page, string> = {
      home: 'Главная', diary: 'Дневник', grades: 'Оценки', absences: 'Пропуски', homework: 'Задания',
      files: 'Файлы', statistics: 'Статистика', notifications: 'Уведомления', report: 'Выписка оценок', other: 'Mykoob',
    };
    const grades = page === 'grades' ? readGrades(this.source) : null;
    // An explicitly empty period is real data, not a parse failure.
    const gradesEmpty = page === 'grades' && !grades && (
      /нет уроков с выставленными оценками/i.test(this.source.textContent ?? '') ||
      Boolean(this.source.querySelector('#gradesContent #empty_data_container'))
    );
    return {
      page, title: pageNames[page], user: readUser(this.source), nav,
      actions: page === 'diary' || page === 'grades' || page === 'absences' ? readActions(this.source) : [],
      selects: page === 'diary' || page === 'grades' || page === 'absences' ? readSelects(this.source) : [],
      diary: page === 'diary' ? readDiary(this.source) : [],
      grades, gradesEmpty,
      absences: page === 'absences' ? readAbsences(this.source) : null,
      gradeFilters: page === 'grades' || page === 'absences' ? readGradeFilters(this.source) : { quick: [], types: [] },
      dateControl: page === 'diary' ? readDateControl(this.source) : null,
      activity: page === 'home' ? readActivity(this.source) : [],
      homeResources: page === 'home' ? readHomeResources(this.source) : [], profileImage: page === 'home' ? readProfileImage(this.source) : undefined,
      embeddedFrame: page === 'statistics' ? readEmbeddedFrame(this.source) : null,
      original: this.source,
    };
  }

  async getSchedule(): Promise<DiaryDay[]> {
    const response = await fetch(new URL('/?lessonsplan', window.location.origin), { credentials: 'include' });
    if (!response.ok) return [];
    const html = await response.text();
    const page = new DOMParser().parseFromString(html, 'text/html');
    return readDiary(page.body);
  }

  activate(action: Action) { action.element.click(); }
  select(select: SourceSelect, value: string) {
    select.element.value = value;
    select.element.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
