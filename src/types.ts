export type Course = 'LC' | 'SC' | 'World';

export type Scope = 'Queensland' | 'Australia' | 'World';

export type RankingEntry = {
  scope: Scope;
  course: Course;
  event: string;
  place: number | null;
  time?: string;
  seconds?: number;
  meet?: string;
  resultDate?: string;
  aheadName?: string;
  aheadTime?: string;
  gapSeconds?: number;
};

export type RankingSnapshot = {
  id: string;
  swimmerId: string;
  checkedAt: string;
  ageGroup: string;
  source: string;
  entries: RankingEntry[];
  notes?: string;
};

export type CompetitionResult = {
  id: string;
  swimmerId: string;
  competition: string;
  date: string;
  year?: number;
  ageGroup: string;
  event: string;
  course: Course;
  time?: string;
  points?: string;
  location?: string;
  placing?: string;
  medal?: 'Gold' | 'Silver' | 'Bronze' | 'None' | 'Unknown';
  notes?: string;
};

export type Achievement = {
  id: string;
  swimmerId: string;
  year: number;
  title: string;
  award: string;
  sourceName: string;
  sourceUrl: string;
  notes?: string;
  minimumMetres?: number;
};

export type EnduranceResult = {
  id: string;
  swimmerId: string;
  year: number;
  ageGroup: string;
  course?: string;
  distance: string;
  stroke: string;
  result: string;
  metres?: number;
  points: number;
  date: string;
  location?: string;
  sourceName: string;
  sourceUrl: string;
};

export type EnduranceProgram = {
  id: string;
  swimmerId: string;
  year: number;
  title: string;
  program: 'million-metres' | 'target-26-26-26' | '50x50';
  status: string;
  completed?: number;
  target?: number;
  unit: string;
  metres?: number;
  sourceName: string;
  sourceUrl: string;
  notes?: string;
};

export type Swimmer = {
  id: string;
  name: string;
  club: string;
  ageGroups: string[];
};

export type RankingsStore = {
  swimmers: Swimmer[];
  snapshots: RankingSnapshot[];
  competitions: CompetitionResult[];
  achievements?: Achievement[];
  enduranceResults?: EnduranceResult[];
  endurancePrograms?: EnduranceProgram[];
  updatedAt: string;
};
