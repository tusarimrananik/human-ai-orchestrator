'use client';

const CACHE_KEYS = {
  DASHBOARD: 'human_ai_cache_dashboard_',
  TASKS: 'human_ai_cache_tasks_',
  PROJECTS: 'human_ai_cache_projects',
  WORKERS: 'human_ai_cache_workers',
  GRAPH: 'human_ai_cache_graph_',
  SYNC_TIMESTAMP: 'human_ai_cache_timestamp',
};

export const localStore = {
  get: <T>(key: string): T | null => {
    if (typeof window === 'undefined') return null;
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  },

  set: (key: string, value: any): void => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn('LocalStorage save error:', err);
    }
  },

  getDashboard: (projectId: string) => localStore.get<any>(`${CACHE_KEYS.DASHBOARD}${projectId}`),
  setDashboard: (projectId: string, data: any) => localStore.set(`${CACHE_KEYS.DASHBOARD}${projectId}`, data),

  getTasks: (queryKey: string) => localStore.get<any[]>(`${CACHE_KEYS.TASKS}${queryKey}`),
  setTasks: (queryKey: string, data: any[]) => localStore.set(`${CACHE_KEYS.TASKS}${queryKey}`, data),

  getProjects: () => localStore.get<any[]>(CACHE_KEYS.PROJECTS),
  setProjects: (data: any[]) => localStore.set(CACHE_KEYS.PROJECTS, data),

  getWorkers: () => localStore.get<any[]>(CACHE_KEYS.WORKERS),
  setWorkers: (data: any[]) => localStore.set(CACHE_KEYS.WORKERS, data),

  getGraph: (projectId: string) => localStore.get<any>(`${CACHE_KEYS.GRAPH}${projectId}`),
  setGraph: (projectId: string, data: any) => localStore.set(`${CACHE_KEYS.GRAPH}${projectId}`, data),
};
