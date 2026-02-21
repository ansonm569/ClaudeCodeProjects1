'use strict';

// ─────────────────────────────────────────────────────────────
// Guest search logic — extracted from script.js for unit testing.
// If you update the search/sort logic in script.js, update here too.
// ─────────────────────────────────────────────────────────────

function filterGuests(guestList, firstName, lastName) {
    const first = firstName.trim().toLowerCase();
    const last  = lastName.trim().toLowerCase();

    return guestList.filter(guest => {
        const gFirst = guest.firstName.toLowerCase();
        const gLast  = guest.lastName.toLowerCase();

        if (first && last) {
            return (gFirst.includes(first) || first.includes(gFirst)) &&
                   (gLast.includes(last)   || last.includes(gLast));
        } else if (first && !last) {
            return gFirst.includes(first) || first.includes(gFirst);
        } else if (!first && last) {
            return gLast.includes(last) || last.includes(gLast);
        }
        return false;
    });
}

function sortMatches(matches, firstName, lastName) {
    const first = firstName.trim().toLowerCase();
    const last  = lastName.trim().toLowerCase();

    return [...matches].sort((a, b) => {
        const aScore = (first && a.firstName.toLowerCase() === first ? 2 : 0)
                     + (last  && a.lastName.toLowerCase()  === last  ? 2 : 0);
        const bScore = (first && b.firstName.toLowerCase() === first ? 2 : 0)
                     + (last  && b.lastName.toLowerCase()  === last  ? 2 : 0);
        return bScore - aScore;
    });
}

// ─────────────────────────────────────────────────────────────
// Sample guest list
// ─────────────────────────────────────────────────────────────

const guests = [
    { id: 1,  groupCode: 1, firstName: 'Jane',           lastName: 'Smith'    },
    { id: 2,  groupCode: 1, firstName: 'John',           lastName: 'Smith'    },
    { id: 3,  groupCode: 2, firstName: 'Alice',          lastName: 'Johnson'  },
    { id: 4,  groupCode: 3, firstName: 'Bob',            lastName: 'Williams' },
    { id: 5,  groupCode: 4, firstName: "Natalie's +1",   lastName: ''         },
    { id: 6,  groupCode: 5, firstName: 'Jon and Alexa',  lastName: 'Brown'    },
    { id: 7,  groupCode: 6, firstName: 'Jan',            lastName: 'Smithson' },
];

// ─────────────────────────────────────────────────────────────
// filterGuests()
// ─────────────────────────────────────────────────────────────

describe('filterGuests()', () => {
    test('both fields empty → no results', () => {
        expect(filterGuests(guests, '', '')).toHaveLength(0);
    });

    test('exact first name match', () => {
        const r = filterGuests(guests, 'Jane', '');
        expect(r).toHaveLength(1);
        expect(r[0].firstName).toBe('Jane');
    });

    test('first name search is case-insensitive', () => {
        expect(filterGuests(guests, 'jane', '')).toHaveLength(1);
        expect(filterGuests(guests, 'JANE', '')).toHaveLength(1);
    });

    test('exact last name match returns all members with that name', () => {
        const r = filterGuests(guests, '', 'Smith');
        expect(r).toHaveLength(2);
        expect(r.map(g => g.firstName)).toContain('Jane');
        expect(r.map(g => g.firstName)).toContain('John');
    });

    test('both names narrows to a single guest', () => {
        const r = filterGuests(guests, 'Jane', 'Smith');
        expect(r).toHaveLength(1);
        expect(r[0].id).toBe(1);
    });

    test('correct first name + wrong last name → no match', () => {
        expect(filterGuests(guests, 'Jane', 'Jones')).toHaveLength(0);
    });

    test('partial / substring first name match', () => {
        const r = filterGuests(guests, 'Ali', '');
        expect(r).toHaveLength(1);
        expect(r[0].firstName).toBe('Alice');
    });

    test('completely unknown name → empty array', () => {
        expect(filterGuests(guests, 'Zephyr', 'Xxxxxx')).toHaveLength(0);
    });

    test('guest with empty last name is found by first name', () => {
        const r = filterGuests(guests, "Natalie's", '');
        expect(r).toHaveLength(1);
        expect(r[0].id).toBe(5);
    });

    test('compound first-name entry (e.g. "Jon and Alexa") is matched by substring', () => {
        const r = filterGuests(guests, 'Jon', '');
        expect(r.map(g => g.id)).toContain(6);
    });

    test('last-name-only search is case-insensitive', () => {
        expect(filterGuests(guests, '', 'smith')).toHaveLength(2);
        expect(filterGuests(guests, '', 'SMITH')).toHaveLength(2);
    });

    test('partial last name matches (e.g. "Smith" matches "Smithson")', () => {
        const r = filterGuests(guests, '', 'Smith');
        const ids = r.map(g => g.id);
        expect(ids).toContain(7); // Jan Smithson
    });
});

// ─────────────────────────────────────────────────────────────
// sortMatches()
// ─────────────────────────────────────────────────────────────

describe('sortMatches()', () => {
    const pool = [
        { id: 10, firstName: 'Jan',  lastName: 'Smith'    }, // partial first, exact last
        { id: 11, firstName: 'Jane', lastName: 'Smith'    }, // exact first + exact last
        { id: 12, firstName: 'Jane', lastName: 'Smithson' }, // exact first + partial last
    ];

    test('exact full-name match sorts to position 0', () => {
        const sorted = sortMatches(pool, 'Jane', 'Smith');
        expect(sorted[0].id).toBe(11);
    });

    test('exact first-name scores higher than partial first-name', () => {
        const sorted = sortMatches(pool, 'Jane', '');
        // Jan (partial) should be last
        expect(sorted[sorted.length - 1].id).toBe(10);
    });

    test('original array is not mutated', () => {
        const original = pool.map(g => ({ ...g }));
        sortMatches(pool, 'Jane', 'Smith');
        expect(pool.map(g => g.id)).toEqual(original.map(g => g.id));
    });

    test('ties preserve relative order (stable-ish sort)', () => {
        // Jane Smith and Jane Smithson both score 2 on first name (exact)
        // when only searching by first name; neither scores on last name
        const sorted = sortMatches(pool, 'Jane', '');
        const topTwo = sorted.slice(0, 2).map(g => g.id);
        expect(topTwo).toContain(11);
        expect(topTwo).toContain(12);
    });

    test('no search terms → scores all zero, order unchanged', () => {
        const sorted = sortMatches(pool, '', '');
        expect(sorted.map(g => g.id)).toEqual(pool.map(g => g.id));
    });
});
