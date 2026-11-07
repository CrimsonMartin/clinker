/**
 * @jest-environment jsdom
 */

// Tests for SyncManager.sanitizeData and uploadToCloud (api/sync.js)

const API = 'https://api.test.example';

global.browser = {
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue()
    }
  }
};

const { SyncManager } = require('../api/sync.js');
const sanitizeData = (obj) => new SyncManager().sanitizeData(obj);

describe('SyncManager Data Sanitization', () => {
  describe('sanitizeData', () => {
    it('should handle null and undefined values', () => {
      expect(sanitizeData(null)).toBe(null);
      expect(sanitizeData(undefined)).toBe(undefined);
    });

    it('should handle primitive values', () => {
      expect(sanitizeData('string')).toBe('string');
      expect(sanitizeData(123)).toBe(123);
      expect(sanitizeData(true)).toBe(true);
      expect(sanitizeData(false)).toBe(false);
    });

    it('should sanitize objects with undefined values', () => {
      const input = {
        validString: 'test',
        validNumber: 42,
        undefinedValue: undefined,
        nullValue: null,
        validBoolean: true
      };

      const result = sanitizeData(input);

      expect(result).toEqual({
        validString: 'test',
        validNumber: 42,
        nullValue: null,
        validBoolean: true
      });
      expect(result).not.toHaveProperty('undefinedValue');
    });

    it('should sanitize nested objects', () => {
      const input = {
        level1: {
          validData: 'test',
          undefinedData: undefined,
          level2: {
            nestedValid: 'nested',
            nestedUndefined: undefined,
            level3: {
              deepValid: 'deep',
              deepUndefined: undefined
            }
          }
        },
        topLevelUndefined: undefined
      };

      const result = sanitizeData(input);

      expect(result).toEqual({
        level1: {
          validData: 'test',
          level2: {
            nestedValid: 'nested',
            level3: {
              deepValid: 'deep'
            }
          }
        }
      });
    });

    it('should sanitize arrays', () => {
      const input = ['valid', undefined, null, 'another valid', undefined];
      const result = sanitizeData(input);

      expect(result).toEqual(['valid', null, 'another valid']);
    });

    it('should sanitize arrays with objects', () => {
      const input = [
        { valid: 'data', invalid: undefined },
        undefined,
        { another: 'valid', alsoBad: undefined },
        null
      ];

      const result = sanitizeData(input);

      expect(result).toEqual([
        { valid: 'data' },
        { another: 'valid' },
        null
      ]);
    });

    it('should handle complex nested structures like citation trees', () => {
      const input = {
        citationTree: {
          nodes: [
            {
              id: 1,
              text: 'Valid node',
              url: 'https://example.com',
              timestamp: '2023-01-01T00:00:00.000Z',
              annotations: [
                { text: 'annotation', timestamp: '2023-01-01T00:00:00.000Z' },
                { text: 'another', undefinedField: undefined }
              ],
              undefinedField: undefined,
              images: ['image1', undefined, 'image2']
            },
            undefined,
            {
              id: 2,
              text: 'Another node',
              badField: undefined
            }
          ],
          currentNodeId: 1,
          undefinedProperty: undefined
        },
        nodeCounter: 5,
        badProperty: undefined
      };

      const result = sanitizeData(input);

      expect(result).toEqual({
        citationTree: {
          nodes: [
            {
              id: 1,
              text: 'Valid node',
              url: 'https://example.com',
              timestamp: '2023-01-01T00:00:00.000Z',
              annotations: [
                { text: 'annotation', timestamp: '2023-01-01T00:00:00.000Z' },
                { text: 'another' }
              ],
              images: ['image1', 'image2']
            },
            {
              id: 2,
              text: 'Another node'
            }
          ],
          currentNodeId: 1
        },
        nodeCounter: 5
      });
    });

    it('should handle empty objects and arrays', () => {
      expect(sanitizeData({})).toEqual({});
      expect(sanitizeData([])).toEqual([]);
      expect(sanitizeData({ empty: {} })).toEqual({ empty: {} });
      expect(sanitizeData({ emptyArray: [] })).toEqual({ emptyArray: [] });
    });

    it('should handle objects with only undefined values', () => {
      const input = {
        onlyUndefined: undefined,
        alsoUndefined: undefined
      };

      const result = sanitizeData(input);
      expect(result).toEqual({});
    });

    it('should handle arrays with only undefined values', () => {
      const input = [undefined, undefined, undefined];
      const result = sanitizeData(input);
      expect(result).toEqual([]);
    });

    it('should preserve deeply nested valid data', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              level4: {
                validData: 'deep value',
                invalidData: undefined
              }
            }
          }
        }
      };

      const result = sanitizeData(input);
      expect(result).toEqual({
        level1: {
          level2: {
            level3: {
              level4: {
                validData: 'deep value'
              }
            }
          }
        }
      });
    });

    it('should handle mixed data types in arrays', () => {
      const input = [
        'string',
        123,
        true,
        null,
        undefined,
        { valid: 'object', invalid: undefined },
        ['nested', undefined, 'array']
      ];

      const result = sanitizeData(input);
      expect(result).toEqual([
        'string',
        123,
        true,
        null,
        { valid: 'object' },
        ['nested', 'array']
      ]);
    });
  });

  describe('uploadToCloud integration', () => {
    let mockAuthManager;
    let syncManager;

    // Body of the PUT /v1/sync request
    const uploaded = () => JSON.parse(global.fetch.mock.calls[0][1].body);

    beforeEach(() => {
      mockAuthManager = {
        getCurrentUser: jest.fn().mockReturnValue({ uid: 'test-uid', email: 'test@example.com' }),
        isLoggedIn: jest.fn().mockReturnValue(true),
        ensureValidToken: jest.fn().mockResolvedValue('token')
      };
      window.authManager = mockAuthManager;
      window.CLINKER_CONFIG = { apiBaseUrl: API };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ data: {}, version: 2, updatedAt: new Date().toISOString() }))
      });
      syncManager = new SyncManager();
      syncManager.loadConfig();
    });

    it('should PUT sanitized data to /v1/sync with the base version', async () => {
      const localData = {
        citationTree: {
          nodes: [
            { id: 1, text: 'test', undefinedField: undefined }
          ],
          currentNodeId: 1
        },
        nodeCounter: 5,
        badField: undefined
      };

      await syncManager.uploadToCloud('test-uid', localData, 1);

      expect(global.fetch).toHaveBeenCalledWith(`${API}/v1/sync`, expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ Authorization: 'Bearer token' })
      }));
      const body = uploaded();
      expect(body.baseVersion).toBe(1);
      expect(body.data).toEqual({
        citationTree: {
          nodes: [
            { id: 1, text: 'test' }
          ],
          currentNodeId: 1
        },
        nodeCounter: 5,
        lastModified: expect.any(String),
        userEmail: 'test@example.com'
      });
      expect(syncManager.remoteVersion).toBe(2);
    });

    it('should send baseVersion null when there is no server document', async () => {
      await syncManager.uploadToCloud('test-uid', {}, null);
      expect(uploaded().baseVersion).toBeNull();
    });

    it('should throw a SyncVersionConflictError carrying the current document on 409', async () => {
      const current = { data: { lastModified: 'x' }, version: 9, updatedAt: 'y' };
      global.fetch.mockResolvedValue({
        ok: false,
        status: 409,
        text: () => Promise.resolve(JSON.stringify({ error: { code: 'version_conflict', message: 'conflict' }, current }))
      });

      await expect(syncManager.uploadToCloud('test-uid', {}, 1)).rejects.toMatchObject({
        name: 'SyncVersionConflictError',
        current
      });
    });

    it('should handle missing user email gracefully', async () => {
      mockAuthManager.getCurrentUser.mockReturnValue(null);

      await syncManager.uploadToCloud('test-uid', { citationTree: { nodes: [], currentNodeId: null }, nodeCounter: 0 }, null);

      expect(uploaded().data.userEmail).toBe(null);
    });

    it('should provide default values for missing required fields', async () => {
      await syncManager.uploadToCloud('test-uid', {}, null);

      expect(uploaded().data).toEqual({
        citationTree: { nodes: [], currentNodeId: null },
        nodeCounter: 0,
        lastModified: expect.any(String),
        userEmail: 'test@example.com'
      });
    });

    it('should include tab metadata when present', async () => {
      const tabsMetadata = { activeTabId: 't1', tabCount: 1, tabTitles: [{ id: 't1', title: 'General' }] };
      await syncManager.uploadToCloud('test-uid', { tabsMetadata }, null);
      expect(uploaded().data.tabsMetadata).toEqual(tabsMetadata);
    });

    it('should sanitize complex nested citation data', async () => {
      const localData = {
        citationTree: {
          nodes: [
            {
              id: 1,
              text: 'Node with annotations',
              annotations: [
                { text: 'Good annotation', timestamp: '2023-01-01T00:00:00.000Z' },
                { text: 'Bad annotation', undefinedProperty: undefined }
              ],
              images: ['image1', undefined, 'image2'],
              undefinedNodeProperty: undefined
            },
            undefined // This entire node should be filtered out
          ],
          currentNodeId: 1,
          undefinedTreeProperty: undefined
        },
        nodeCounter: 2,
        undefinedRootProperty: undefined
      };

      await syncManager.uploadToCloud('test-uid', localData, null);

      const uploadedData = uploaded().data;
      expect(uploadedData.citationTree.nodes).toHaveLength(1);
      expect(uploadedData.citationTree.nodes[0]).toEqual({
        id: 1,
        text: 'Node with annotations',
        annotations: [
          { text: 'Good annotation', timestamp: '2023-01-01T00:00:00.000Z' },
          { text: 'Bad annotation' }
        ],
        images: ['image1', 'image2']
      });
      expect(uploadedData.citationTree.currentNodeId).toBe(1);
    });
  });
});
