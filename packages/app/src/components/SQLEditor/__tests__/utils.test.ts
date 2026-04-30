import { isInValueContext } from '../utils';

describe('isInValueContext', () => {
  describe('suppresses — inside a string literal', () => {
    it("prefix starts with single quote (= 'value)", () => {
      expect(isInValueContext("'test", 'ServiceName = ')).toBe(true);
    });
    it('prefix starts with single quote (partial)', () => {
      expect(isInValueContext("'t", 'ServiceName = ')).toBe(true);
    });
    it('closed quote still suppresses (cursor inside)', () => {
      expect(isInValueContext("'test'", 'ServiceName = ')).toBe(true);
    });
    it('odd quotes in textBefore (LIKE with wildcard)', () => {
      expect(isInValueContext('abc', "ServiceName LIKE '%")).toBe(true);
    });
    it('odd quotes in multi-condition textBefore', () => {
      expect(isInValueContext('5', "x = 'foo' AND y = '")).toBe(true);
    });
  });

  describe('suppresses — after a comparison operator', () => {
    it('equals, unquoted number', () => {
      expect(isInValueContext('5', 'count =')).toBe(true);
    });
    it('equals with space', () => {
      expect(isInValueContext('5', 'count = ')).toBe(true);
    });
    it('not equals !=', () => {
      expect(isInValueContext('foo', 'x !=')).toBe(true);
    });
    it('<>', () => {
      expect(isInValueContext('bar', 'x <>')).toBe(true);
    });
    it('less than', () => {
      expect(isInValueContext('10', 'age <')).toBe(true);
    });
    it('greater than', () => {
      expect(isInValueContext('10', 'age >')).toBe(true);
    });
    it('<=', () => {
      expect(isInValueContext('10', 'age <=')).toBe(true);
    });
    it('>=', () => {
      expect(isInValueContext('10', 'age >=')).toBe(true);
    });
    it('LIKE keyword', () => {
      expect(isInValueContext('abc', 'name LIKE ')).toBe(true);
    });
    it('ILIKE keyword', () => {
      expect(isInValueContext('abc', 'name ILIKE ')).toBe(true);
    });
    it('NOT LIKE keyword', () => {
      expect(isInValueContext('abc', 'name NOT LIKE ')).toBe(true);
    });
    it('NOT ILIKE keyword', () => {
      expect(isInValueContext('abc', 'name NOT ILIKE ')).toBe(true);
    });
    it('bracket field = value', () => {
      expect(
        isInValueContext("'test", "ResourceAttributes['k8s.cluster.name']="),
      ).toBe(true);
    });
  });

  describe('suppresses — inside an IN list', () => {
    it('IN ( with single number', () => {
      expect(isInValueContext('3', 'x IN (1, 2,')).toBe(true);
    });
    it('NOT IN ( list', () => {
      expect(isInValueContext('5', 'x NOT IN (1, 2,')).toBe(true);
    });
    it('IN ( first value', () => {
      expect(isInValueContext('1', 'x IN (')).toBe(true);
    });
  });

  describe('does NOT suppress — typing a field name', () => {
    it('empty query', () => {
      expect(isInValueContext('', '')).toBe(false);
    });
    it('plain WHERE clause start', () => {
      expect(isInValueContext('x', 'WHERE ')).toBe(false);
    });
    it('after AND keyword', () => {
      expect(isInValueContext('level', "ServiceName = 'foo' AND ")).toBe(false);
    });
    it('after complete condition, even quote count', () => {
      expect(isInValueContext('s', "x = 'foo' AND ")).toBe(false);
    });
    it('first token in query', () => {
      expect(isInValueContext('Ser', '')).toBe(false);
    });
    it('inside function call args (not IN)', () => {
      expect(isInValueContext('y', 'count(x,')).toBe(false);
    });
    it('after OR keyword', () => {
      expect(isInValueContext('z', 'x = 1 OR ')).toBe(false);
    });
  });
});
