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
  ageGroup: string;
  event: string;
  course: Course;
  time?: string;
  placing?: string;
  medal?: 'Gold' | 'Silver' | 'Bronze' | 'None' | 'Unknown';
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
  updatedAt: string;
};
