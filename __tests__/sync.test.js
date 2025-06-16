/**
 * @jest-environment jsdom
 */

// Standalone implementation of the sanitizeData function for testing
function sanitizeData(obj) {
  if (obj === null) {
    return null;
  }
  
  if (obj === undefined) {
    return undefined; // Signal that this should be removed
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeData(item)).filter(item => item !== undefined);
  }
  
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      const sanitizedValue = sanitizeData(value);
      if (sanitizedValue !== undefined) {
        sanitized[key] = sanitizedValue;
      }
    }
    return sanitized;
  }
  
  return obj;
}

// Mock upload function that uses sanitizeData
async function uploadToCloud(userId, localData, authManager, db) {
  const currentUser = authManager.getCurrentUser();
  const userEmail = currentUser ? currentUser.email : null;

  const dataToUpload = {
    citationTree: localData.citationTree || { nodes: [], currentNodeId: null },
    nodeCounter: localData.nodeCounter || 0,
    lastModified: new Date().toISOString(),
    userEmail: userEmail
  };

  const sanitizedData = sanitizeData(dataToUpload);
  return await db.collection('users').doc(userId).set(sanitizedData);
}

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
    let mockAuthManager, mockDb, mockDoc, mockCollection;

    beforeEach(() => {
      mockDoc = {
        set: jest.fn().mockResolvedValue()
      };
      mockCollection = {
        doc: jest.fn().mockReturnValue(mockDoc)
      };
      mockDb = {
        collection: jest.fn().mockReturnValue(mockCollection)
      };
      mockAuthManager = {
        getCurrentUser: jest.fn().mockReturnValue({
          uid: 'test-uid',
          email: 'test@example.com'
        })
      };
    });

    it('should sanitize data before uploading to Firestore', async () => {
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

      await uploadToCloud('test-uid', localData, mockAuthManager, mockDb);

      expect(mockDb.collection).toHaveBeenCalledWith('users');
      expect(mockCollection.doc).toHaveBeenCalledWith('test-uid');
      
      const uploadedData = mockDoc.set.mock.calls[0][0];
      expect(uploadedData).toEqual({
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
      
      // Ensure no undefined values made it through
      expect(JSON.stringify(uploadedData)).not.toContain('undefined');
    });

    it('should handle missing user email gracefully', async () => {
      mockAuthManager.getCurrentUser.mockReturnValue(null);

      const localData = {
        citationTree: { nodes: [], currentNodeId: null },
        nodeCounter: 0
      };

      await uploadToCloud('test-uid', localData, mockAuthManager, mockDb);

      const uploadedData = mockDoc.set.mock.calls[0][0];
      expect(uploadedData.userEmail).toBe(null);
      expect(uploadedData).not.toHaveProperty('undefinedField');
    });

    it('should provide default values for missing required fields', async () => {
      const localData = {}; // Empty data

      await uploadToCloud('test-uid', localData, mockAuthManager, mockDb);

      const uploadedData = mockDoc.set.mock.calls[0][0];
      expect(uploadedData).toEqual({
        citationTree: { nodes: [], currentNodeId: null },
        nodeCounter: 0,
        lastModified: expect.any(String),
        userEmail: 'test@example.com'
      });
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

      await uploadToCloud('test-uid', localData, mockAuthManager, mockDb);

      const uploadedData = mockDoc.set.mock.calls[0][0];
      
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
      expect(uploadedData).not.toHaveProperty('undefinedRootProperty');
      expect(uploadedData.citationTree).not.toHaveProperty('undefinedTreeProperty');
      
      // Verify no undefined values exist anywhere in the data
      const serialized = JSON.stringify(uploadedData);
      expect(serialized).not.toContain('undefined');
    });
  });
});
