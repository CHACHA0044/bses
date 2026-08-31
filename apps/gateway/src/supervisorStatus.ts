export interface SupervisorStatusPayload {
  supervisor: {
    pid: number;
    uptimeSeconds: number;
    state: string;
  };
  services: Array<{
    name: string;
    state: string;
    port: number;
    pid: number | null;
    restarts: number;
    lastStartedAt: number | null;
    uptimeSeconds: number | null;
    ready: boolean;
  }>;
}

let supervisorStatus: SupervisorStatusPayload | null = null;

export const setSupervisorStatus = (payload: SupervisorStatusPayload): void => {
  supervisorStatus = payload;
};

export const getSupervisorStatus = (): SupervisorStatusPayload | null => supervisorStatus;