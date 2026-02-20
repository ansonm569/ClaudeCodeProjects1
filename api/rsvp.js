const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method === 'POST') return handleSubmit(req, res);
    if (req.method === 'GET') return handleLookup(req, res);

    return res.status(405).json({ error: 'Method not allowed' });
};

// -------------------------------------------------------
// POST /api/rsvp  — save RSVP + send confirmation email
// -------------------------------------------------------
async function handleSubmit(req, res) {
    const {
        partyId,
        primaryGuestId,
        primaryGuestName,
        email,
        partyMembers,        // [{ id, name }]
        partyAttendance,     // { [guestId]: { welcomeDrinks, wedding } }
        dietaryRestrictions,
        songRequest,
        message
    } = req.body;

    if (!partyId || !primaryGuestId || !email) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Upsert — update if this party already RSVP'd, otherwise insert
    const { error: dbError } = await supabase
        .from('rsvps')
        .upsert({
            party_id: partyId,
            primary_guest_id: primaryGuestId,
            primary_guest_name: primaryGuestName,
            email,
            party_members: partyMembers,
            party_attendance: partyAttendance,
            dietary_restrictions: dietaryRestrictions || null,
            song_request: songRequest || null,
            message: message || null,
            updated_at: new Date().toISOString()
        }, { onConflict: 'party_id' });

    if (dbError) {
        console.error('Supabase error:', dbError);
        return res.status(500).json({ error: 'Failed to save RSVP' });
    }

    // Send confirmation email (non-blocking — a failure here doesn't fail the RSVP)
    try {
        const firstName = primaryGuestName.split(' ')[0];
        const editLink = `https://blytheandanson.com/rsvp.html?guestId=${primaryGuestId}`;

        const welcomeAttendees = partyMembers
            .filter(m => partyAttendance[m.id]?.welcomeDrinks)
            .map(m => m.name);
        const weddingAttendees = partyMembers
            .filter(m => partyAttendance[m.id]?.wedding)
            .map(m => m.name);

        await resend.emails.send({
            from: 'Blythe & Anson <rsvp@blytheandanson.com>',
            to: email,
            subject: `RSVP Confirmed — Blythe & Anson's Wedding`,
            html: buildEmailHtml({
                firstName,
                welcomeAttendees,
                weddingAttendees,
                dietaryRestrictions,
                songRequest,
                message,
                editLink
            })
        });
    } catch (emailErr) {
        console.error('Resend error:', emailErr);
        // RSVP was saved — don't fail the response just because email failed
    }

    return res.status(200).json({ success: true });
}

// -------------------------------------------------------
// GET /api/rsvp?guestId=X  — look up existing RSVP
// -------------------------------------------------------
async function handleLookup(req, res) {
    const { guestId } = req.query;

    if (!guestId) {
        return res.status(400).json({ error: 'guestId is required' });
    }

    const { data, error } = await supabase
        .from('rsvps')
        .select('*')
        .eq('primary_guest_id', parseInt(guestId))
        .single();

    if (error || !data) {
        return res.status(404).json({ error: 'No RSVP found' });
    }

    return res.status(200).json(data);
}

// -------------------------------------------------------
// Email HTML builder
// -------------------------------------------------------
function buildEmailHtml({ firstName, welcomeAttendees, weddingAttendees, dietaryRestrictions, songRequest, message, editLink }) {
    const darkGreen = '#3d5a30';
    const oliveGreen = '#8B9B7E';
    const bgGray = '#f4f4f0';

    const nameList = (names) => {
        if (!names || names.length === 0) {
            return `<span style="color:#999;font-style:italic;">No one from your party</span>`;
        }
        return names.map(n => `<div style="padding:3px 0;">${n}</div>`).join('');
    };

    const optionalRow = (label, value) => value ? `
        <tr>
            <td style="padding:0 0 20px;">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${oliveGreen};">${label}</p>
                <p style="margin:0;font-size:15px;color:#333;">${value}</p>
            </td>
        </tr>` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${bgGray};font-family:Georgia,serif;color:#333;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${bgGray};padding:40px 20px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

      <!-- Header -->
      <tr>
        <td style="background:${darkGreen};padding:44px 40px 36px;text-align:center;">
          <p style="margin:0 0 6px;color:rgba(255,255,255,0.6);font-size:12px;letter-spacing:3px;text-transform:uppercase;">You're all set</p>
          <h1 style="margin:0;color:#fff;font-size:30px;font-weight:normal;letter-spacing:1px;">Blythe &amp; Anson</h1>
          <p style="margin:10px 0 0;color:rgba(255,255,255,0.65);font-size:14px;">April 17, 2027 &nbsp;·&nbsp; The Brix on Fox</p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:40px 40px 8px;">
          <p style="margin:0 0 10px;font-size:20px;">Hi ${firstName},</p>
          <p style="margin:0 0 32px;font-size:15px;line-height:1.75;color:#555;">Thanks for your RSVP! We can't wait to celebrate with you. Here's a summary of what we have on file.</p>

          <!-- Welcome Drinks -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
            <tr>
              <td style="padding:20px;background:#f9f9f7;border-radius:8px;border-left:4px solid ${oliveGreen};">
                <p style="margin:0 0 2px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${oliveGreen};">Welcome Drinks</p>
                <p style="margin:0 0 12px;font-size:12px;color:#999;">April 16, 2027 at 7:00 PM</p>
                <div style="font-size:15px;">${nameList(welcomeAttendees)}</div>
              </td>
            </tr>
          </table>

          <!-- Wedding -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr>
              <td style="padding:20px;background:#f9f9f7;border-radius:8px;border-left:4px solid ${darkGreen};">
                <p style="margin:0 0 2px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${darkGreen};">Wedding Ceremony &amp; Reception</p>
                <p style="margin:0 0 12px;font-size:12px;color:#999;">April 17, 2027 at 5:00 PM</p>
                <div style="font-size:15px;">${nameList(weddingAttendees)}</div>
              </td>
            </tr>
          </table>

          <!-- Optional fields -->
          <table width="100%" cellpadding="0" cellspacing="0">
            ${optionalRow('Dietary Restrictions', dietaryRestrictions)}
            ${optionalRow('Song Request', songRequest)}
            ${message ? optionalRow('Note to the Couple', `<em>"${message}"</em>`) : ''}
          </table>

          <!-- Edit button -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
            <tr>
              <td style="background:${bgGray};border-radius:8px;padding:24px;text-align:center;">
                <p style="margin:0 0 16px;font-size:14px;color:#666;">Need to make a change? You can update your RSVP at any time before <strong>February 1, 2027</strong>.</p>
                <a href="${editLink}" style="display:inline-block;background:${darkGreen};color:#fff;text-decoration:none;padding:14px 36px;border-radius:6px;font-size:14px;letter-spacing:0.5px;">Update My RSVP</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding:28px 40px;text-align:center;border-top:1px solid #eee;">
          <p style="margin:0;font-size:13px;color:#aaa;">Questions? Just text Blythe or Anson directly.</p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}
