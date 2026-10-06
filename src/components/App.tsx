import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell, BookOpen, CalendarDays, ChartNoAxesColumn, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, Download, ExternalLink, FileText, House, Menu, MessageSquare, Printer,
  Search, UserRound, X, ClipboardList, Clock3, CircleCheck, CircleAlert, LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DiaryDay, GradeRow, Lesson, MykoobAdapter, MykoobSnapshot, NavigationItem, Page, SourceSelect } from '../mykoob/models';

const icons: Record<Page, LucideIcon> = {
  home: House, diary: CalendarDays, grades: BookOpen, absences: CircleAlert, homework: ClipboardList,
  files: FileText, statistics: ChartNoAxesColumn, notifications: Bell, report: Download, other: CircleHelp,
};

const fallbackNav: NavigationItem[] = [
  { page: 'home', label: 'Домой', href: 'https://family.mykoob.lv/?profile' },
  { page: 'diary', label: 'Дневник', href: 'https://family.mykoob.lv/?lessonsplan' },
  { page: 'grades', label: 'Оценки', href: 'https://family.mykoob.lv/?viewgrades/period' },
  { page: 'absences', label: 'Пропуски', href: 'https://family.mykoob.lv/?viewgrades/periodAttendance' },
  { page: 'files', label: 'Файлы', href: 'https://family.mykoob.lv/?files' },
  { page: 'statistics', label: 'Статистика', href: 'https://family.mykoob.lv/?statistic/show' },
  { page: 'notifications', label: 'Уведомления', href: 'https://family.mykoob.lv/?journal/notes' },
  { page: 'report', label: 'Выписка оценок', href: 'https://family.mykoob.lv/?reportperiod' },
];

// Column positions in the original Mykoob diary table. Keep in sync with readDiary().
const GRADE_CELL_INDEX = 3;
const FEEDBACK_CELL_INDEX = 7;

function activateNav(item: NavigationItem) {
  if (item.source) { if (item.href.startsWith('javascript:')) revealSource(); item.source.click(); return; }
  if (item.href && !item.href.startsWith('javascript:')) window.location.assign(item.href);
}

function revealSource() {
  const panel = document.querySelector<HTMLDetailsElement>('.bm-source-panel');
  if (panel) {
    panel.open = true;
    const source = panel.querySelector<HTMLElement>('#bettermykoob-original');
    if (source) source.hidden = false;
  }
}

function ActionIcon({ label }: { label: string }) {
  if (/печать|print/i.test(label)) return <Printer size={16} />;
  if (/экспорт|export|выписка|report/i.test(label)) return <Download size={16} />;
  return <ExternalLink size={16} />;
}

function SelectControl({ select, adapter }: { select: SourceSelect; adapter: MykoobAdapter }) {
  return <label className="bm-select-wrap"><span className="bm-sr-only">{select.label}</span>
    <select value={select.value} onChange={event => adapter.select(select, event.target.value)}>
      {select.options.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
    </select><ChevronDown size={15} aria-hidden="true" />
  </label>;
}

function PageActions({ snapshot, adapter }: { snapshot: MykoobSnapshot; adapter: MykoobAdapter }) {
  return <div className="bm-page-actions">
    {snapshot.selects.map(select => <SelectControl key={select.label} select={select} adapter={adapter} />)}
    {snapshot.actions.filter(action => !/выписка оценок/i.test(action.label)).map((action, index) =>
      <button className="bm-button bm-button-secondary" key={`${action.label}-${index}`} onClick={() => { revealSource(); adapter.activate(action); }}>
        <ActionIcon label={action.label} /><span>{action.label}</span>
      </button>)}
  </div>;
}

function sourceCellClick(row: HTMLTableRowElement, index: number) {
  const cell = row.querySelectorAll('td,th')[index] as HTMLElement | undefined;
  sourceGradeCellClick(cell);
}

function sourceGradeCellClick(cell: HTMLElement | undefined, gradeIndex = 0) {
  revealSource();
  const clickables = cell?.querySelectorAll<HTMLElement>('a,button,[role="button"]');
  const target = clickables?.[gradeIndex] || clickables?.[0] || cell;
  target?.click();
}

function sourceHomeworkCellClick(lesson: Lesson) {
  const cell = lesson.sourceRow.querySelectorAll<HTMLElement>('td')[5];
  if (!cell) return;
  const label = lesson.homework.replace(/^\*\s*/, '').trim();
  const descendants = [...cell.querySelectorAll<HTMLElement>('*')];
  const target = descendants.find(element => element.children.length === 0 && element.textContent?.trim() === label)
    || cell.querySelector<HTMLElement>('[onclick],a,button,[role="button"]')
    || cell;
  revealSource();
  target.click();
}

function GradeChip({ value, onClick }: { value: string; onClick?: () => void }) {
  if (!value) return <span className="bm-dash">—</span>;
  const numeric = parseFloat(value.replace('%', '').replace(',', '.'));
  const isPercent = value.includes('%');
  const tone = Number.isNaN(numeric) ? 'neutral' : isPercent
    ? numeric >= 70 ? 'success' : numeric >= 40 ? 'warning' : 'danger'
    : numeric >= 7 ? 'success' : numeric >= 4 ? 'warning' : 'danger';
  if (onClick) return <button className={`bm-grade bm-grade-${tone} bm-grade-button`} onClick={onClick} aria-label={`Оценка ${value}, сравнить с одноклассниками`}>{value}</button>;
  return <span className={`bm-grade bm-grade-${tone}`}>{value}</span>;
}

function AttendanceState({ value }: { value: string }) {
  if (!value) return <span className="bm-dash">—</span>;
  const present = /^(✓|✔|\+)$|посещено|apmeklēts/i.test(value);
  const Icon = present ? CircleCheck : CircleAlert;
  return <span className={`bm-state ${present ? 'bm-state-present' : 'bm-state-other'}`}><Icon size={15} /><span>{value}</span></span>;
}

function HomeworkState({ value, onClick }: { value: string; onClick?: () => void }) {
  if (!value) return <span className="bm-dash">—</span>;
  if (onClick) return <button className="bm-homework bm-homework-button" onClick={onClick} aria-label={`Открыть задание ${value}`}>{value}</button>;
  return <span className="bm-homework">{value}</span>;
}

function LessonRow({ lesson }: { lesson: Lesson }) {
  const [expanded, setExpanded] = useState(false);
  const empty = !lesson.subject;
  return <>
    <tr className={`bm-lesson ${empty ? 'bm-lesson-empty' : ''}`}>
      <td className="bm-num">{lesson.number}</td>
      <td className="bm-time">{lesson.time}</td>
      <td className="bm-subject"><strong>{lesson.subject || '—'}</strong><span className="bm-table-sub">{lesson.teacher}</span></td>
      <td className="bm-room">{lesson.room || '—'}</td>
      <td className="bm-teacher">{lesson.teacher || '—'}</td>
      <td><GradeChip value={lesson.grade} onClick={lesson.grade ? () => sourceCellClick(lesson.sourceRow, GRADE_CELL_INDEX) : undefined} /></td>
      <td><AttendanceState value={lesson.attendance} /></td>
      <td><HomeworkState value={lesson.homework} onClick={lesson.homework ? () => sourceHomeworkCellClick(lesson) : undefined} /></td>
      <td className="bm-topic">{lesson.topic || '—'}</td>
      <td className="bm-feedback">{lesson.feedbackAction ? <button className="bm-icon-button" aria-label={`Открыть отзыв для урока ${lesson.number}`} onClick={() => sourceCellClick(lesson.sourceRow, FEEDBACK_CELL_INDEX)}><MessageSquare size={16} /></button> : lesson.feedback || '—'}</td>
      <td className="bm-expand-cell"><button className="bm-icon-button" aria-label={`${expanded ? 'Скрыть' : 'Показать'} детали урока ${lesson.number}`} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><ChevronDown size={16} /></button></td>
    </tr>
    {expanded && !empty && <tr className="bm-lesson-details"><td colSpan={11}>
      <div><strong>Преподаватель</strong><span>{lesson.teacher || '—'}</span></div>
      <div><strong>Кабинет</strong><span>{lesson.room || '—'}</span></div>
      <div><strong>Тема</strong><span>{lesson.topic || '—'}</span></div>
      <div><strong>Отзыв</strong><span>{lesson.feedbackAction ? <button className="bm-inline-link" onClick={() => sourceCellClick(lesson.sourceRow, FEEDBACK_CELL_INDEX)}>Открыть отзыв</button> : lesson.feedback || '—'}</span></div>
    </td></tr>}
  </>;
}

function MobileLesson({ lesson }: { lesson: Lesson }) {
  const [expanded, setExpanded] = useState(false);
  if (!lesson.subject) return <div className="bm-mobile-empty"><span>{lesson.number}</span><span>{lesson.time}</span><span>Нет занятия</span></div>;
  return <article className="bm-mobile-lesson">
    <div className="bm-mobile-lesson-head"><span className="bm-mobile-time">{lesson.time}</span><span className="bm-mobile-number">{lesson.number}</span></div>
    <div className="bm-mobile-lesson-main"><strong>{lesson.subject}</strong><span>{lesson.room}</span></div>
    <div className="bm-mobile-status"><GradeChip value={lesson.grade} onClick={lesson.grade ? () => sourceCellClick(lesson.sourceRow, GRADE_CELL_INDEX) : undefined} /><AttendanceState value={lesson.attendance} /><HomeworkState value={lesson.homework} onClick={lesson.homework ? () => sourceHomeworkCellClick(lesson) : undefined} /></div>
    {(lesson.teacher || lesson.topic || lesson.feedback) && <button className="bm-details-toggle" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>Подробности <ChevronDown size={15} /></button>}
    {expanded && <div className="bm-mobile-detail"><div><b>Преподаватель</b><span>{lesson.teacher || '—'}</span></div><div><b>Тема</b><span>{lesson.topic || '—'}</span></div><div><b>Отзыв</b><span>{lesson.feedbackAction ? <button className="bm-inline-link" onClick={() => sourceCellClick(lesson.sourceRow, FEEDBACK_CELL_INDEX)}>Открыть отзыв</button> : lesson.feedback || '—'}</span></div></div>}
  </article>;
}

function DiaryDayView({ day }: { day: DiaryDay }) {
  return <section className="bm-day"><div className="bm-section-heading"><h2>{day.date}</h2><span>{day.lessons.filter(lesson => lesson.subject).length} занятий</span></div>
    <div className="bm-table-scroll"><table className="bm-data-table bm-diary-table"><thead><tr>
      <th scope="col">№</th><th scope="col">Время</th><th scope="col">Дисциплина</th><th scope="col">Кабинет</th><th scope="col">Учитель</th><th scope="col">Оценка</th><th scope="col">Посещаемость</th><th scope="col">Задание</th><th scope="col">Тема</th><th scope="col">Отзыв</th><th scope="col" className="bm-expand-cell"><span className="bm-sr-only">Детали</span></th>
    </tr></thead><tbody>{day.lessons.map((lesson, index) => <LessonRow key={`${day.date}-${index}`} lesson={lesson} />)}</tbody></table></div>
    <div className="bm-mobile-lessons">{day.lessons.map((lesson, index) => <MobileLesson key={`${day.date}-mobile-${index}`} lesson={lesson} />)}</div>
  </section>;
}

function DiaryPage({ snapshot, adapter }: { snapshot: MykoobSnapshot; adapter: MykoobAdapter }) {
  if (!snapshot.diary.length) return <EmptyState title="Расписание не найдено" text="Откройте исходную страницу, чтобы проверить данные." />;
  return <>
    <div className="bm-toolbar"><div className="bm-date-switch">
      <button className="bm-icon-button" disabled={!snapshot.dateControl?.previous} aria-label="Предыдущая неделя" onClick={() => snapshot.dateControl?.previous?.click()}><ChevronLeft size={18} /></button>
      <span><CalendarDays size={17} /><span className="bm-date-label">{snapshot.dateControl?.label || `${snapshot.diary[0].date} — ${snapshot.diary.at(-1)?.date || snapshot.diary[0].date}`}</span></span>
      <button className="bm-icon-button" disabled={!snapshot.dateControl?.next} aria-label="Следующая неделя" onClick={() => snapshot.dateControl?.next?.click()}><ChevronRight size={18} /></button>
    </div><PageActions snapshot={snapshot} adapter={adapter} /></div>
    <p className="bm-help">Нажмите на оценку, чтобы сравнить её с оценками одноклассников.</p>
    <div className="bm-days">{snapshot.diary.map(day => <DiaryDayView day={day} key={day.date} />)}</div>
  </>;
}

function GradeRowView({ row, headings }: { row: GradeRow; headings: string[] }) {
  return <tr><th scope="row">{row.subject}</th>{row.values.map((value, index) => <td key={index}><div className="bm-grade-cell">{value ? value.split(/,\s*/).filter(Boolean).map((grade, gradeIndex) => <GradeChip key={gradeIndex} value={grade} onClick={/средн|average|vidēj/i.test(headings[index + 1] || '') ? undefined : () => sourceGradeCellClick(row.sourceCells[index], gradeIndex)} />) : <span className="bm-dash">—</span>}</div></td>)}{row.values.length < headings.length - 1 && Array.from({ length: headings.length - 1 - row.values.length }).map((_, index) => <td key={`blank-${index}`}><span className="bm-dash">—</span></td>)}</tr>;
}

function setOriginalDate(input: HTMLInputElement | undefined, value: string) {
  if (!input) return;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function GradeControls({ snapshot, adapter }: { snapshot: MykoobSnapshot; adapter: MykoobAdapter }) {
  const filters = snapshot.gradeFilters;
  const [start, setStart] = useState(filters.startDate?.value ?? '');
  const [end, setEnd] = useState(filters.endDate?.value ?? '');
  useEffect(() => { setStart(filters.startDate?.value ?? ''); setEnd(filters.endDate?.value ?? ''); }, [filters.startDate?.value, filters.endDate?.value]);
  return <><div className="bm-grades-controls"><div className="bm-grades-period">
    {filters.startDate && <label><span>С</span><input type="text" aria-label="Дата начала" inputMode="numeric" placeholder="ДД.ММ.ГГГГ" autoComplete="off" value={start} onChange={event => { setStart(event.target.value); setOriginalDate(filters.startDate, event.target.value); }} /></label>}
    {filters.endDate && <label><span>По</span><input type="text" aria-label="Дата окончания" inputMode="numeric" placeholder="ДД.ММ.ГГГГ" autoComplete="off" value={end} onChange={event => { setEnd(event.target.value); setOriginalDate(filters.endDate, event.target.value); }} /></label>}
    {filters.apply && <button className="bm-button bm-button-primary" onClick={() => filters.apply?.click()}>Применить</button>}
    </div><div className="bm-quick-filters">{filters.quick.map(control => <button key={control.label} className={control.active ? 'bm-filter-active' : ''} onClick={() => control.element.click()}>{control.label}</button>)}</div>
    <PageActions snapshot={snapshot} adapter={adapter} /></div>
    {filters.types.length > 0 && <div className="bm-grade-tabs" role="tablist" aria-label="Тип работы">{filters.types.map(control => <button key={control.label} role="tab" aria-selected={control.active} className={control.active ? 'bm-tab-active' : ''} onClick={() => control.element.click()}>{control.label}</button>)}</div>}
  </>;
}

function GradesPage({ snapshot, adapter }: { snapshot: MykoobSnapshot; adapter: MykoobAdapter }) {
  const table = snapshot.grades;
  const [subject, setSubject] = useState('all');
  if (!table) return <EmptyState title="Таблица оценок не найдена" text="Откройте исходную страницу, чтобы проверить данные." />;
  return <><GradeControls snapshot={snapshot} adapter={adapter} />
    <div className="bm-table-scroll bm-grades-desktop"><table className="bm-data-table bm-grades-table"><thead><tr>{table.headings.map((heading, index) => <th scope="col" key={index}>{heading}</th>)}</tr></thead><tbody>{table.rows.map((row, index) => <GradeRowView key={index} row={row} headings={table.headings} />)}</tbody></table></div>
    <div className="bm-grades-mobile"><label className="bm-field-label" htmlFor="bm-subject">Предмет</label><select id="bm-subject" value={subject} onChange={event => setSubject(event.target.value)}><option value="all">Все предметы</option>{table.rows.map((row, index) => <option key={index} value={String(index)}>{row.subject}</option>)}</select>
      {table.rows.filter((_, index) => subject === 'all' || subject === String(index)).map((row, index) => <section className="bm-mobile-grade" key={index}><h2>{row.subject}</h2>{row.values.map((value, cellIndex) => <div key={cellIndex}><span>{table.headings[cellIndex + 1] || `Период ${cellIndex + 1}`}</span><span className="bm-grade-cell">{value ? value.split(/,\s*/).filter(Boolean).map((grade, gradeIndex) => <GradeChip key={gradeIndex} value={grade} onClick={/средн|average|vidēj/i.test(table.headings[cellIndex + 1] || '') ? undefined : () => sourceGradeCellClick(row.sourceCells[cellIndex], gradeIndex)} />) : <span className="bm-dash">—</span>}</span></div>)}</section>)}
    </div>
  </>;
}

function HomePage({ snapshot, adapter }: { snapshot: MykoobSnapshot; adapter: MykoobAdapter }) {
  const [schedule, setSchedule] = useState<DiaryDay[]>([]);
  useEffect(() => { let active = true; adapter.getSchedule().then(days => { if (active) setSchedule(days); }).catch(() => { if (active) setSchedule([]); }); return () => { active = false; }; }, [adapter]);
  const groups = [...new Set(snapshot.activity.map(item => item.group))];
  // Capture "now" once per schedule. Reading the clock inside render makes output depend on render time.
  const now = useMemo(() => new Date(), [schedule]);
  const upcoming = schedule.flatMap(day => day.lessons.filter(lesson => lesson.subject).map(lesson => ({ day: day.date, lesson }))).filter(({ day, lesson }) => {
    const date = day.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    const time = lesson.time.match(/^(\d{2}):(\d{2})/);
    return date && time && new Date(Number(date[3]), Number(date[2]) - 1, Number(date[1]), Number(time[1]), Number(time[2])) >= now;
  }).slice(0, 4);
  const homework = schedule.flatMap(day => day.lessons.filter(lesson => lesson.subject && lesson.homework).map(lesson => ({ day: day.date, lesson }))).slice(0, 3);
  return <div className={`bm-home-layout ${upcoming.length || homework.length ? 'bm-home-three' : ''}`}><aside className="bm-home-side">
    <section className="bm-home-profile"><div className="bm-home-profile-top"><span className="bm-avatar">{snapshot.profileImage ? <img src={snapshot.profileImage} alt="Фото профиля ученика" fetchPriority="high" /> : <UserRound size={19} />}</span><div><strong>{snapshot.user.name || 'Ученик'}</strong><span>{snapshot.user.group || 'Группа не указана'}</span></div></div>{snapshot.user.academicYear && <div className="bm-home-year"><CalendarDays size={15} />{snapshot.user.academicYear} mācību gads</div>}</section>
    {snapshot.homeResources.length > 0 && <section className="bm-home-resources"><h2>Ресурсы</h2>{snapshot.homeResources.map(resource => <button key={resource.label} onClick={() => { revealSource(); resource.source.click(); }}>{resource.label}<ExternalLink size={15} /></button>)}</section>}
  </aside><div className="bm-home-feed"><div className="bm-home-feed-head"><div><h2>Мои действия</h2><p>Последние изменения в Mykoob</p></div></div>
    {groups.map(group => <section key={group} className="bm-activity-group"><h3>{group}</h3>{snapshot.activity.filter(item => item.group === group).map((item, index) => {
      const grade = /оценк|результат|grade/i.test(item.title);
      const absence = /пропуск|attendance|kavēj/i.test(item.title);
      const Icon = grade ? BookOpen : absence ? CircleAlert : ClipboardList;
      return <article className="bm-activity-item" key={`${group}-${index}`}><span className={`bm-activity-icon ${absence ? 'bm-activity-warning' : grade ? 'bm-activity-success' : ''}`}><Icon size={16} /></span><div><p>{item.title}</p><time>{item.detail}</time></div></article>;
    })}</section>)}
  </div>{(upcoming.length > 0 || homework.length > 0) && <aside className="bm-home-context">
    {upcoming.length > 0 && <section><h2><Clock3 size={16} />Ближайшие уроки</h2>{upcoming.map(({ day, lesson }, index) => <div className="bm-context-row" key={`${day}-${index}`}><span>{day} · {lesson.time}</span><strong>{lesson.subject}</strong><small>{lesson.room}</small></div>)}</section>}
    {homework.length > 0 && <section><h2><ClipboardList size={16} />Задания в расписании</h2>{homework.map(({ day, lesson }, index) => <div className="bm-context-row" key={`${day}-${index}`}><span>{day} · {lesson.homework}</span><strong>{lesson.subject}</strong><small>{lesson.topic}</small></div>)}</section>}
  </aside>}</div>;
}

function EmptyState({ title, text }: { title: string; text: string }) { return <div className="bm-empty"><Search size={24} /><h2>{title}</h2><p>{text}</p></div>; }

function OriginalPage({ snapshot }: { snapshot: MykoobSnapshot }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current && snapshot.original.parentElement !== ref.current) ref.current.appendChild(snapshot.original); snapshot.original.hidden = false; }, [snapshot.original]);
  return <section className="bm-original-card"><div className="bm-original-heading"><h2>{snapshot.title}</h2><span>Данные Mykoob</span></div><div className="bm-original-content" ref={ref} /></section>;
}

function SourcePanel({ snapshot }: { snapshot: MykoobSnapshot }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && snapshot.original.parentElement !== ref.current) ref.current.appendChild(snapshot.original);
    snapshot.original.hidden = !ref.current?.closest('details')?.open;
  }, [snapshot.original]);
  return <details className="bm-source-panel" onToggle={event => { snapshot.original.hidden = !event.currentTarget.open; }}><summary>Дополнительные действия Mykoob</summary><div className="bm-original-content" ref={ref} /></details>;
}

function Header({ snapshot, nav, onMenu }: { snapshot: MykoobSnapshot; nav: NavigationItem[]; onMenu: () => void }) {
  const notifications = nav.find(item => item.page === 'notifications');
  // The original Mykoob DOM is large. Query it once per snapshot instead of on every render.
  const messages = useMemo(() => [...snapshot.original.querySelectorAll<HTMLElement>('a,button,[role="button"]')].find(element => /сообщ|messages|ziņoj|mail|inbox|✉/i.test([element.textContent, element.getAttribute('title'), element.getAttribute('aria-label'), element.getAttribute('href')].join(' '))), [snapshot.original]);
  const profileControl = useMemo(() => [...snapshot.original.querySelectorAll<HTMLElement>('a,button,[role="button"],div')].find(element => {
    const label = [element.getAttribute('title'), element.getAttribute('aria-label'), element.getAttribute('data-original-title'), element.children.length === 0 ? element.textContent : ''].join(' ');
    return /(^|\s)(профиль|profile|profils)(\s|$)/i.test(label) && label.length < 80;
  }), [snapshot.original]);
  const logout = useMemo(() => [...snapshot.original.querySelectorAll<HTMLAnchorElement>('a')].find(link => /выход|logout|iziet/i.test(link.textContent || '')), [snapshot.original]);
  return <header className="bm-header"><div className="bm-header-inner">
    <button className="bm-icon-button bm-menu-button" aria-label="Открыть меню" onClick={onMenu}><Menu size={21} /></button>
    <a className="bm-brand" href={nav.find(item => item.page === 'home')?.href || fallbackNav[0].href}><span className="bm-brand-mark">m</span><span>mykoob<span className="bm-brand-plus">+</span></span></a>
    <div className="bm-header-context"><span>{snapshot.user.group || 'Mykoob'}</span>{snapshot.user.academicYear && <small>{snapshot.user.academicYear} mācību gads</small>}</div>
    <div className="bm-header-spacer" />
    {messages && <button className="bm-icon-button" aria-label="Сообщения" onClick={() => { revealSource(); messages.click(); }}><MessageSquare size={19} /></button>}
    {notifications && <button className="bm-icon-button bm-header-notifications" aria-label="Уведомления" onClick={() => activateNav(notifications)}><Bell size={19} />{notifications.count && <i />}</button>}
    <button className="bm-profile-button" aria-label="Профиль" onClick={() => { if (profileControl) { revealSource(); profileControl.click(); } else activateNav(nav.find(item => item.page === 'home') || fallbackNav[0]); }}><span className="bm-avatar"><UserRound size={17} /></span><span className="bm-profile-name">{snapshot.user.name || 'Профиль'}</span></button>
    {logout && <button className="bm-icon-button bm-logout" aria-label="Выйти" onClick={() => logout.click()}><LogOut size={18} /></button>}
  </div></header>;
}

function MainNavigation({ page, nav, drawer, onClose, onOpen }: { page: Page; nav: NavigationItem[]; drawer: boolean; onClose: () => void; onOpen: () => void }) {
  const items = useMemo(() => {
    const known = nav.length ? nav : fallbackNav;
    return known.filter(item => item.page !== 'report');
  }, [nav]);
  return <><nav className="bm-main-nav" aria-label="Основная навигация"><div className="bm-nav-inner">{items.map(item => {
    const Icon = icons[item.page]; return <button key={item.page} className={`bm-nav-item ${page === item.page ? 'bm-nav-active' : ''}`} onClick={() => activateNav(item)} aria-current={page === item.page ? 'page' : undefined}><Icon size={17} /><span>{item.label}</span>{item.count && <b>{item.count}</b>}</button>;
  })}</div></nav>
    {drawer && <div className="bm-drawer-backdrop" onClick={onClose}><div className="bm-drawer" role="dialog" aria-modal="true" aria-label="Навигация" onClick={event => event.stopPropagation()}><div className="bm-drawer-head"><strong>Разделы</strong><button className="bm-icon-button" aria-label="Закрыть меню" onClick={onClose}><X size={20} /></button></div>{items.map(item => { const Icon = icons[item.page]; return <button key={item.page} className={`bm-drawer-item ${page === item.page ? 'bm-nav-active' : ''}`} onClick={() => activateNav(item)}><Icon size={19} />{item.label}{item.count && <b>{item.count}</b>}</button>; })}</div></div>}
    <nav className="bm-bottom-nav" aria-label="Мобильная навигация">{(['home', 'diary', 'grades', 'homework'] as Page[]).map(target => { const item = items.find(i => i.page === target); if (!item) return null; const Icon = icons[target]; return <button key={target} className={page === target ? 'bm-bottom-active' : ''} onClick={() => activateNav(item)}><Icon size={20} /><span>{item.label}</span></button>; })}<button onClick={onOpen}><Menu size={20} /><span>Ещё</span></button></nav>
  </>;
}

export function App({ snapshot, adapter }: { snapshot: MykoobSnapshot; adapter: MykoobAdapter }) {
  const [drawer, setDrawer] = useState(false);
  const nav = snapshot.nav;
  return <div className="bm-app"><Header snapshot={snapshot} nav={nav} onMenu={() => setDrawer(true)} /><MainNavigation page={snapshot.page} nav={nav} drawer={drawer} onClose={() => setDrawer(false)} onOpen={() => setDrawer(true)} />
    <main className="bm-main"><div className="bm-page-heading"><div><div className="bm-breadcrumb">Mykoob <ChevronRight size={14} /> {snapshot.title}</div><h1>{snapshot.title}</h1></div><span className="bm-student-label">{snapshot.user.label}</span></div>
      {snapshot.page === 'home' && snapshot.activity.length ? <><HomePage snapshot={snapshot} adapter={adapter} /><SourcePanel snapshot={snapshot} /></> : snapshot.page === 'diary' && snapshot.diary.length ? <><DiaryPage snapshot={snapshot} adapter={adapter} /><SourcePanel snapshot={snapshot} /></> : snapshot.page === 'grades' && snapshot.grades ? <><GradesPage snapshot={snapshot} adapter={adapter} /><SourcePanel snapshot={snapshot} /></> : <OriginalPage snapshot={snapshot} />}
    </main>
  </div>;
}
