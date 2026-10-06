export type Page = 'home' | 'diary' | 'grades' | 'absences' | 'homework' | 'files' | 'statistics' | 'notifications' | 'report' | 'other';

export interface UserContext {
  label: string;
  name: string;
  group: string;
  academicYear: string;
}

export interface NavigationItem { page: Page; label: string; href: string; count?: string; source?: HTMLAnchorElement; }
export interface Action { label: string; element: HTMLElement; }
export interface SelectOption { label: string; value: string; }
export interface SourceSelect { label: string; element: HTMLSelectElement; options: SelectOption[]; value: string; }

export interface Lesson {
  number: string;
  time: string;
  subject: string;
  room: string;
  teacher: string;
  grade: string;
  attendance: string;
  homework: string;
  topic: string;
  feedback: string;
  feedbackAction: boolean;
  sourceRow: HTMLTableRowElement;
}

export interface DiaryDay { date: string; lessons: Lesson[]; }
export interface GradeRow { subject: string; values: string[]; sourceCells: HTMLElement[]; }
export interface GradeTable { headings: string[]; rows: GradeRow[]; }
export interface AbsenceEntry { status: string; date: string; title: string; }
export interface AbsenceRow { subject: string; entries: AbsenceEntry[][]; summary: string[]; }
export interface AbsenceTable { months: string[]; summaryHeadings: string[]; rows: AbsenceRow[]; }
export interface GradeFilterControl { label: string; element: HTMLElement; active: boolean; }
export interface GradeFilters {
  startDate?: HTMLInputElement;
  endDate?: HTMLInputElement;
  apply?: HTMLElement;
  quick: GradeFilterControl[];
  types: GradeFilterControl[];
}
export interface ActivityEntry { title: string; detail: string; group: string; source: HTMLElement; }
export interface HomeResource { label: string; source: HTMLElement; }

export interface MykoobSnapshot {
  page: Page;
  title: string;
  user: UserContext;
  nav: NavigationItem[];
  actions: Action[];
  selects: SourceSelect[];
  diary: DiaryDay[];
  grades: GradeTable | null;
  gradesEmpty: boolean;
  absences: AbsenceTable | null;
  gradeFilters: GradeFilters;
  dateControl: { label: string; previous?: HTMLElement; next?: HTMLElement } | null;
  activity: ActivityEntry[];
  homeResources: HomeResource[];
  profileImage?: string;
  embeddedFrame: HTMLIFrameElement | null;
  original: HTMLElement;
}

export interface MykoobAdapter {
  read(): MykoobSnapshot;
  getSchedule(): Promise<DiaryDay[]>;
  activate(action: Action): void;
  select(select: SourceSelect, value: string): void;
}
