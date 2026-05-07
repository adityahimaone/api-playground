import { create } from 'zustand';
import {
  RequestEntity,
  ResponseExample,
  createRequestEntity,
} from '../entities';

interface RequestState {
  requests: Record<string, RequestEntity>;
  responses: Record<string, ResponseExample[]>;
}

interface RequestActions {
  loadRequests: (reqs: RequestEntity[]) => void;
  loadResponses: (resps: ResponseExample[]) => void;
  getRequest: (id: string) => RequestEntity | undefined;
  createRequest: (name?: string) => RequestEntity;
  updateRequest: (id: string, changes: Partial<RequestEntity>) => void;
  deleteRequest: (id: string) => void;
  getResponses: (requestId: string) => ResponseExample[];
  addResponse: (resp: ResponseExample) => void;
  deleteResponse: (id: string) => void;
}

type RequestStore = RequestState & RequestActions;

export const useRequestStore = create<RequestStore>((set, get) => ({
  requests: {},
  responses: {},

  loadRequests: (reqs) => {
    const map: Record<string, RequestEntity> = {};
    for (const req of reqs) {
      map[req.id] = req;
    }
    set({ requests: map });
  },

  loadResponses: (resps) => {
    const map: Record<string, ResponseExample[]> = {};
    for (const resp of resps) {
      if (!map[resp.requestId]) {
        map[resp.requestId] = [];
      }
      map[resp.requestId].push(resp);
    }
    set({ responses: map });
  },

  getRequest: (id) => {
    return get().requests[id];
  },

  createRequest: (name) => {
    const req = createRequestEntity(name);
    set((state) => ({
      requests: { ...state.requests, [req.id]: req },
    }));
    return req;
  },

  updateRequest: (id, changes) => {
    set((state) => {
      const existing = state.requests[id];
      if (!existing) return state;
      return {
        requests: {
          ...state.requests,
          [id]: { ...existing, ...changes, updatedAt: Date.now() },
        },
      };
    });
  },

  deleteRequest: (id) => {
    set((state) => {
      const { [id]: _, ...rest } = state.requests;
      const { [id]: __, ...restResponses } = state.responses;
      return { requests: rest, responses: restResponses };
    });
  },

  getResponses: (requestId) => {
    return get().responses[requestId] || [];
  },

  addResponse: (resp) => {
    set((state) => {
      const existing = state.responses[resp.requestId] || [];
      return {
        responses: {
          ...state.responses,
          [resp.requestId]: [...existing, resp],
        },
      };
    });
  },

  deleteResponse: (id) => {
    set((state) => {
      const newResponses = { ...state.responses };
      for (const reqId of Object.keys(newResponses)) {
        const filtered = newResponses[reqId].filter((r) => r.id !== id);
        if (filtered.length === 0) {
          delete newResponses[reqId];
        } else {
          newResponses[reqId] = filtered;
        }
      }
      return { responses: newResponses };
    });
  },
}));
