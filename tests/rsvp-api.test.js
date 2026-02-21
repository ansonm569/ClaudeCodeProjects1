'use strict';

// Set required env vars before any module is loaded
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.RESEND_API_KEY = 're_test_key';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function makeReq(method, { body = {}, query = {} } = {}) {
    return { method, body, query };
}

function makeRes() {
    const res = {
        _status: 200,
        _json: null,
        _ended: false,
        status(code) { this._status = code; return this; },
        json(data)   { this._json  = data; return this; },
        end()        { this._ended = true; return this; },
        setHeader()  {},
    };
    return res;
}

const validBody = {
    groupCode:        'G001',
    primaryGuestId:   1,
    primaryGuestName: 'Jane Smith',
    email:            'jane@example.com',
    partyMembers:     [{ id: '1', name: 'Jane Smith' }],
    partyAttendance:  { '1': { welcomeDrinks: true, wedding: true } },
    dietaryRestrictions: null,
    songRequest:      null,
    message:          null,
};

// ─────────────────────────────────────────────────────────────
// Tests — each beforeEach loads a fresh handler with fresh mocks
// using jest.doMock + jest.resetModules so module-level Supabase
// and Resend singletons are recreated with the correct fakes.
// ─────────────────────────────────────────────────────────────

describe('RSVP API handler', () => {
    let handler, mockUpsert, mockSingle, mockEmailSend;

    beforeEach(() => {
        jest.resetModules();

        mockUpsert    = jest.fn();
        mockSingle    = jest.fn();
        mockEmailSend = jest.fn();

        jest.doMock('@supabase/supabase-js', () => ({
            createClient: () => ({
                from: () => ({
                    upsert: mockUpsert,
                    select: () => ({ eq: () => ({ single: mockSingle }) }),
                }),
            }),
        }));

        jest.doMock('resend', () => ({
            Resend: function () {
                return { emails: { send: mockEmailSend } };
            },
        }));

        handler = require('../api/rsvp');
    });

    afterEach(() => jest.clearAllMocks());

    // ── Routing ──────────────────────────────────────────────

    test('OPTIONS returns 200', async () => {
        const res = makeRes();
        await handler(makeReq('OPTIONS'), res);
        expect(res._status).toBe(200);
        expect(res._ended).toBe(true);
    });

    test('unsupported method returns 405', async () => {
        const res = makeRes();
        await handler(makeReq('DELETE'), res);
        expect(res._status).toBe(405);
        expect(res._json).toEqual({ error: 'Method not allowed' });
    });

    // ── POST /api/rsvp ───────────────────────────────────────

    describe('POST — validation', () => {
        test('empty body returns 400', async () => {
            const res = makeRes();
            await handler(makeReq('POST', { body: {} }), res);
            expect(res._status).toBe(400);
            expect(res._json.error).toMatch(/missing required fields/i);
        });

        test('missing groupCode returns 400', async () => {
            const { groupCode, ...rest } = validBody;
            const res = makeRes();
            await handler(makeReq('POST', { body: rest }), res);
            expect(res._status).toBe(400);
        });

        test('missing primaryGuestId returns 400', async () => {
            const { primaryGuestId, ...rest } = validBody;
            const res = makeRes();
            await handler(makeReq('POST', { body: rest }), res);
            expect(res._status).toBe(400);
        });

        test('missing email returns 400', async () => {
            const { email, ...rest } = validBody;
            const res = makeRes();
            await handler(makeReq('POST', { body: rest }), res);
            expect(res._status).toBe(400);
        });
    });

    describe('POST — success path', () => {
        beforeEach(() => {
            mockUpsert.mockResolvedValue({ error: null });
            mockEmailSend.mockResolvedValue({ id: 'email-id-123' });
        });

        test('valid RSVP returns 200 { success: true }', async () => {
            const res = makeRes();
            await handler(makeReq('POST', { body: validBody }), res);
            expect(res._status).toBe(200);
            expect(res._json).toEqual({ success: true });
        });

        test('upsert is called once with correct column names', async () => {
            const res = makeRes();
            await handler(makeReq('POST', { body: validBody }), res);
            expect(mockUpsert).toHaveBeenCalledTimes(1);
            const arg = mockUpsert.mock.calls[0][0];
            expect(arg.group_code).toBe('G001');
            expect(arg.primary_guest_id).toBe(1);
            expect(arg.email).toBe('jane@example.com');
            expect(arg.party_members).toEqual([{ id: '1', name: 'Jane Smith' }]);
            expect(arg.party_attendance).toEqual({ '1': { welcomeDrinks: true, wedding: true } });
        });

        test('confirmation email is sent to the RSVP email address', async () => {
            const res = makeRes();
            await handler(makeReq('POST', { body: validBody }), res);
            expect(mockEmailSend).toHaveBeenCalledTimes(1);
            const emailArg = mockEmailSend.mock.calls[0][0];
            expect(emailArg.to).toBe('jane@example.com');
            expect(emailArg.subject).toMatch(/rsvp confirmed/i);
        });

        test('optional fields (dietary, song, message) are passed through', async () => {
            const body = { ...validBody, dietaryRestrictions: 'Vegan', songRequest: 'September', message: 'Congrats!' };
            const res = makeRes();
            await handler(makeReq('POST', { body }), res);
            const arg = mockUpsert.mock.calls[0][0];
            expect(arg.dietary_restrictions).toBe('Vegan');
            expect(arg.song_request).toBe('September');
            expect(arg.message).toBe('Congrats!');
        });
    });

    describe('POST — error handling', () => {
        test('Supabase error returns 500', async () => {
            mockUpsert.mockResolvedValue({ error: { message: 'connection refused' } });
            const res = makeRes();
            await handler(makeReq('POST', { body: validBody }), res);
            expect(res._status).toBe(500);
            expect(res._json).toEqual({ error: 'Failed to save RSVP' });
        });

        test('email failure does not fail the RSVP (non-blocking)', async () => {
            mockUpsert.mockResolvedValue({ error: null });
            mockEmailSend.mockRejectedValue(new Error('Resend is down'));
            const res = makeRes();
            await handler(makeReq('POST', { body: validBody }), res);
            // RSVP was saved — response should still be 200
            expect(res._status).toBe(200);
            expect(res._json).toEqual({ success: true });
        });

        test('email is not sent when Supabase fails', async () => {
            mockUpsert.mockResolvedValue({ error: { message: 'DB error' } });
            const res = makeRes();
            await handler(makeReq('POST', { body: validBody }), res);
            expect(mockEmailSend).not.toHaveBeenCalled();
        });
    });

    // ── GET /api/rsvp ────────────────────────────────────────

    describe('GET — lookup', () => {
        test('missing guestId returns 400', async () => {
            const res = makeRes();
            await handler(makeReq('GET', { query: {} }), res);
            expect(res._status).toBe(400);
            expect(res._json).toEqual({ error: 'guestId is required' });
        });

        test('found RSVP returns 200 with the row data', async () => {
            const mockRow = { group_code: 'G001', primary_guest_id: 1, email: 'jane@example.com' };
            mockSingle.mockResolvedValue({ data: mockRow, error: null });
            const res = makeRes();
            await handler(makeReq('GET', { query: { guestId: '1' } }), res);
            expect(res._status).toBe(200);
            expect(res._json).toEqual(mockRow);
        });

        test('RSVP not found returns 404', async () => {
            mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
            const res = makeRes();
            await handler(makeReq('GET', { query: { guestId: '999' } }), res);
            expect(res._status).toBe(404);
            expect(res._json).toEqual({ error: 'No RSVP found' });
        });
    });
});
