// PACER Coach Brain v1.0
// AI coaching layer — auto Strava sync, morning briefing, post-run analysis
// Add to PACER repo. Load via <script src="coach-brain.js"></script> before </body>

(function () {
  'use strict';

  // ── MODELS ──────────────────────────────────────────────
  const MODEL_FAST = 'claude-haiku-4-5-20251001';
  const MODEL_DEEP = 'claude-sonnet-4-6';

  // ── MEMORY ──────────────────────────────────────────────
  function getMemory() {
    try { return JSON.parse(localStorage.getItem('pacer_coach_memory') || '{}'); } catch { return {}; }
  }
  function saveMemory(patch) {
    try {
      const m = { ...getMemory(), ...patch, updatedAt: Date.now() };
      localStorage.setItem('pacer_coach_memory', JSON.stringify(m));
    } catch {}
  }
  function getUserPrefs() {
    try {
      const s = JSON.parse(localStorage.getItem('pacer_session') || '{}');
      return s.prefs || { name: 'Runner', city: 'Bengaluru', weekGoal: 40, diet: 'vegetarian' };
    } catch { return { name: 'Runner', city: 'Bengaluru', weekGoal: 40, diet: 'vegetarian' }; }
  }
  function getRunLog() {
    try { return JSON.parse(localStorage.getItem('pacer_run_log') || '{}'); } catch { return {}; }
  }
  function getPlan() {
    try { return JSON.parse(localStorage.getItem('pacer_plan') || 'null'); } catch { return null; }
  }
  function getApiKey() {
    return localStorage.getItem('pacer_claude_key') || '';
  }
  function todayKey() {
    return new Date().toISOString().split('T')[0];
  }

  // ── SESSIONS ─────────────────────────────────────────────
  const PLANS = {
    beginner: { name: 'Start Running', s: [['easy', 'Easy run/walk', 3], ['rest', 'Rest day', 0], ['easy', 'Easy run', 4], ['rest', 'Rest day', 0], ['easy', 'Easy run', 3], ['rest', 'Rest day', 0], ['long', 'Long run', 5]] },
    general:  { name: 'Get Fit',       s: [['easy', 'Easy run', 5], ['easy', 'Easy run', 4], ['easy', 'Easy run + strides', 5], ['easy', 'Easy run', 4], ['rest', 'Rest day', 0], ['rest', 'Rest day', 0], ['long', 'Long run', 8]] },
    faster:   { name: 'Run Faster',    s: [['easy', 'Easy base run', 6], ['intervals', 'Speed intervals: 6×400m', 8], ['easy', 'Easy recovery run', 5], ['tempo', 'Tempo run', 7], ['easy', 'Easy run', 6], ['rest', 'Rest day', 0], ['long', 'Long run', 12]] },
    '5k':     { name: '5K Plan',       s: [['easy', 'Easy run', 4], ['easy', 'Easy run', 5], ['intervals', 'Intervals: 6×400m', 6], ['easy', 'Easy run', 5], ['tempo', 'Tempo run', 5], ['rest', 'Rest day', 0], ['long', 'Long run', 8]] },
    half:     { name: 'Half Marathon', s: [['easy', 'Easy run', 8], ['easy', 'Easy run', 6], ['intervals', 'Intervals: 8×400m', 10], ['easy', 'Easy run', 8], ['tempo', 'Tempo run', 8], ['rest', 'Rest day', 0], ['long', 'Long run', 18]] },
    marathon: { name: 'Marathon',      s: [['easy', 'Easy run', 10], ['easy', 'Easy run', 8], ['intervals', 'Intervals: 10×400m', 12], ['easy', 'Easy run', 10], ['tempo', 'Tempo run', 12], ['rest', 'Rest day', 0], ['long', 'Long run', 28]] },
    fitness:  { name: 'General Fitness',s: [['easy', 'Easy run', 5], ['easy', 'Easy run', 4], ['tempo', 'Tempo effort', 5], ['easy', 'Easy run', 5], ['easy', 'Easy run', 4], ['rest', 'Rest day', 0], ['long', 'Long run', 8]] }
  };
  const SESSION_WHY = {
    easy: 'Easy runs build your aerobic base — 80% of all improvement comes from here. Keep it conversational. You should be able to talk throughout.',
    intervals: 'Speed intervals raise your VO2max — the ceiling of how fast you can run. Hard 400m efforts with full recovery. This is what makes you faster.',
    tempo: 'Tempo runs push your lactate threshold — the pace you can hold for a long time. 20-25 minutes at comfortably hard. Between easy and all-out.',
    long: 'The long run builds endurance that transfers to every other session. Slow is right. The pace doesnt matter — the time on your feet does.',
    rest: 'Adaptation happens during rest, not during runs. Today is when you actually get fitter. Stay off your feet, eat well, sleep early.',
    recovery: 'Active recovery flushes out fatigue. Very easy — slower than you think you need to go. This protects your next hard session.'
  };
  function getTodaySession() {
    const plan = getPlan();
    const type = plan?.type || 'general';
    const p = PLANS[type] || PLANS.general;
    const [sType, desc, km] = p.s[new Date().getDay() % p.s.length];
    return { type: sType, desc, km, why: SESSION_WHY[sType] || '', planName: p.name };
  }

  // ── CONDITIONS ───────────────────────────────────────────
  const SEASONAL = {
    Bhubaneswar: [[58,22,68],[52,25,62],[60,32,52],[72,36,40],[80,40,35],[65,33,72],[58,30,85],[55,29,86],[62,30,80],[68,28,70],[65,25,66],[60,22,66]],
    Bengaluru:   [[55,24,55],[58,26,52],[60,28,48],[62,30,52],[60,29,56],[48,25,70],[42,23,78],[44,23,78],[48,24,76],[52,23,72],[55,22,68],[56,22,62]],
    Mumbai:      [[85,28,65],[80,29,62],[75,32,65],[68,34,72],[62,34,78],[52,30,88],[42,28,92],[42,28,91],[52,29,88],[74,31,80],[85,30,73],[90,28,67]],
    Delhi:       [[210,16,75],[180,19,68],[145,25,45],[125,35,28],[115,40,22],[90,40,36],[72,33,70],[68,32,74],[88,33,65],[140,28,50],[205,22,64],[230,16,74]],
    Chennai:     [[66,28,72],[62,30,68],[64,33,62],[68,36,60],[70,38,58],[58,34,72],[52,32,80],[50,32,82],[58,32,80],[72,30,76],[78,28,74],[72,28,72]],
    Hyderabad:   [[58,24,58],[54,27,52],[60,32,42],[70,36,28],[75,40,22],[65,34,45],[55,28,72],[52,27,74],[58,28,68],[65,26,58],[62,24,60],[62,23,60]],
    Pune:        [[52,22,52],[48,25,48],[54,30,42],[62,34,34],[65,36,30],[52,28,60],[44,25,72],[42,25,74],[48,26,70],[52,24,62],[55,22,58],[54,22,54]],
    Kolkata:     [[95,20,72],[85,23,68],[80,30,60],[90,34,56],[95,36,60],[72,32,82],[60,30,88],[58,30,88],[68,31,84],[78,30,76],[90,26,70],[95,22,72]],
    Ahmedabad:   [[68,22,55],[62,25,48],[70,32,36],[82,38,22],[88,42,18],[72,38,40],[62,32,65],[60,30,68],[68,32,60],[72,28,50],[72,24,52],[70,22,54]],
    Jaipur:      [[80,16,68],[72,20,58],[78,28,40],[90,36,22],[95,40,18],[82,36,38],[68,30,62],[65,28,66],[72,30,58],[80,28,48],[82,22,55],[84,17,62]]
  };
  function getConditions(city) {
    const month = new Date().getMonth();
    const hour = new Date().getHours();
    const d = SEASONAL[city] || SEASONAL.Bengaluru;
    const [aqi, base, hum] = d[month];
    const tOff = hour < 6 ? -7 : hour < 9 ? -3 : hour < 13 ? 3 : hour < 17 ? 6 : hour < 20 ? 2 : -4;
    const temp = Math.round(base + tOff);
    const hi = Math.round(temp + 0.33 * (hum / 100 * 6.105 * Math.exp(17.27 * temp / (237.3 + temp))) - 4);
    const thermal = Math.round(Math.max(0, (hi - 28) * 5 + Math.max(0, hum - 60) / 10 * 3));
    let verdict, vColor;
    if (aqi > 200 || hi > 44) { verdict = 'REST'; vColor = '#ff4444'; }
    else if (aqi > 150 || hi > 38) { verdict = 'WAIT'; vColor = '#FF9500'; }
    else if (aqi > 100 || hi > 32) { verdict = 'GO EASY'; vColor = '#FCD34D'; }
    else { verdict = 'GO RUN'; vColor = '#4ADE80'; }
    return { aqi, temp, humidity: hum, hi, thermal, verdict, vColor };
  }

  // ── CLAUDE API ───────────────────────────────────────────
  async function callClaude(system, userMsg, model, maxTokens) {
    const key = getApiKey();
    if (!key) return null;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: model || MODEL_FAST,
          max_tokens: maxTokens || 200,
          system,
          messages: [{ role: 'user', content: userMsg }]
        })
      });
      const d = await res.json();
      return d?.content?.[0]?.text || null;
    } catch (e) { console.warn('PACER Coach API:', e); return null; }
  }

  // ── MORNING BRIEFING GENERATION ──────────────────────────
  async function generateBriefing(prefs, cond, session, runLog) {
    const now = new Date();
    const hour = now.getHours();
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    const recent = (runLog.runs || []).slice(0, 3).map(r => `${r.dist || r.distKm + 'km'} on ${r.date}`).join(', ') || 'no recent runs logged';
    const mem = getMemory();

    const system = `You are a running coach for Indian runners on the PACER app. 
Your name is Coach. You send a daily briefing — like a WhatsApp voice note transcribed.
Rules: MAX 3-4 sentences. Be specific with numbers and session names. 
You know Indian conditions: monsoon, 40°C heat, AQI, roti/curd rice/sattu nutrition.
Sound human. Be direct. No fluff. No emojis. No bullet points.
If conditions are bad, say so. If it's a rest day, make it about recovery.`;

    const msg = `Generate today's morning briefing for ${prefs.name}.
Time: ${timeStr}, ${dateStr}
City: ${prefs.city}
Conditions: AQI ${cond.aqi}, heat index ${cond.hi}°C — ${cond.verdict}${cond.thermal > 0 ? `, +${cond.thermal}s/km harder than ideal` : ''}
Today's plan: ${session.desc}${session.km > 0 ? ` (${session.km}km)` : ''} — ${session.planName}
This week: ${runLog.weeklyKm || 0}km of ${prefs.weekGoal}km goal, streak: ${runLog.streak || 0} runs
Recent: ${recent}
${mem.lastCoachingNote ? `Last coaching note: ${mem.lastCoachingNote}` : ''}
Write the briefing now.`;

    return await callClaude(system, msg, MODEL_FAST, 200);
  }

  function fallbackBriefing(prefs, cond, session, runLog) {
    const hour = new Date().getHours();
    const wkm = runLog.weeklyKm || 0;
    const rem = Math.max(0, (prefs.weekGoal || 40) - wkm);
    if (session.type === 'rest') {
      return `Rest day. ${wkm}km done this week${rem > 0 ? `, ${rem}km to goal` : ' — goal reached'}. Adaptation happens today. Stay off your feet, eat well.`;
    }
    const condNote = cond.thermal > 15
      ? ` Conditions are tough — run +${cond.thermal}s/km slower than usual. Don't fight the heat.`
      : cond.verdict === 'GO RUN' ? ' Good conditions.'
      : ` AQI ${cond.aqi}, heat index ${cond.hi}°C.`;
    const timeNote = hour < 9 ? ' Morning window is the right call.' : hour >= 17 ? ' Evening run — carry extra water.' : ' Get it done early if you can.';
    return `${session.desc} today — ${session.km}km.${condNote}${timeNote} ${wkm}km done this week, ${rem}km remaining.`;
  }

  // ── POST-RUN ANALYSIS GENERATION ─────────────────────────
  async function generatePostRunAnalysis(run, prefs, cond, feeling, runLog) {
    const system = `You are a running coach for Indian runners on PACER.
A new run just synced from Strava. Give post-run coaching feedback.
Rules: 3-4 sentences max. Be specific with the numbers. Sound like a coach, not a chatbot.
Give one thing they did well, one thing to note. End with what to do next session.
You know Indian conditions and Indian food for recovery.`;

    const msg = `New Strava run for ${prefs.name}:
${run.dist || run.distKm + 'km'}, ${run.t || ''}${run.pace ? `, avg pace ${run.pace}` : ''}${run.heartRate ? `, avg HR ${run.heartRate}bpm` : ''}
Conditions during run: AQI ${cond.aqi}, heat index ${cond.hi}°C — ${cond.verdict}${cond.thermal > 0 ? ` (+${cond.thermal}s/km harder)` : ''}
How it felt: ${feeling}
This week: ${runLog.weeklyKm || 0}km total, streak ${runLog.streak || 0}
City: ${prefs.city}
Give coaching feedback.`;

    return await callClaude(system, msg, MODEL_FAST, 220);
  }

  // ── STRAVA AUTO-SYNC ──────────────────────────────────────
  async function autoSyncStrava() {
    const token = localStorage.getItem('pacer_strava_token');
    const expiry = parseInt(localStorage.getItem('pacer_strava_expiry') || '0');
    if (!token) return null;
    if (expiry && Date.now() / 1000 > expiry - 300) return null; // expired

    try {
      const lastSync = parseInt(localStorage.getItem('pacer_last_autosync') || '0');
      const after = lastSync
        ? Math.floor(lastSync / 1000) - 300
        : Math.floor((Date.now() - 8 * 24 * 3600 * 1000) / 1000);

      const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=10`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return null;

      const activities = await res.json();
      const runs = activities.filter(a => a.type === 'Run' || a.sport_type === 'Run');
      localStorage.setItem('pacer_last_autosync', String(Date.now()));

      if (!runs.length) return { newRuns: [] };

      const existing = getRunLog();
      const existingIds = new Set((existing.runs || []).map(r => r.stravaId).filter(Boolean));
      const newRuns = runs.filter(r => !existingIds.has(r.id));

      if (newRuns.length === 0) return { newRuns: [] };

      // Format and save
      const formatted = runs.map(r => ({
        name: r.name || 'Run',
        label: 'Run',
        distKm: Math.round(r.distance / 100) / 10,
        dist: `${Math.round(r.distance / 100) / 10}km`,
        mins: Math.round(r.moving_time / 60),
        t: fmtTime(r.moving_time),
        pace: r.average_speed > 0 ? fmtPace(r.average_speed) : null,
        heartRate: r.average_heartrate ? Math.round(r.average_heartrate) : null,
        feel: 'good', ok: true,
        date: r.start_date?.split('T')[0],
        stravaId: r.id
      }));

      const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
      const weeklyKm = Math.round(formatted.filter(r => r.date >= weekAgo).reduce((s, r) => s + (r.distKm || 0), 0) * 10) / 10;
      const allRuns = [...formatted, ...(existing.runs || []).filter(r => !runs.find(sr => sr.id === r.stravaId))].slice(0, 100);

      // Compute streak
      const dates = new Set(formatted.map(r => r.date).filter(Boolean));
      let streak = 0;
      let d = new Date(formatted[0].date + 'T00:00:00');
      for (let i = 0; i < 365; i++) {
        if (dates.has(d.toISOString().split('T')[0])) { streak++; d.setDate(d.getDate() - 1); }
        else break;
      }

      const updatedLog = { ...existing, runs: allRuns, weeklyKm, streak, lastRunDate: formatted[0].date, stravaSync: Date.now() };
      localStorage.setItem('pacer_run_log', JSON.stringify(updatedLog));

      return { newRuns: newRuns.map(r => formatted.find(f => f.stravaId === r.id)).filter(Boolean), latestRun: formatted[0] };
    } catch (e) { console.warn('Strava sync error:', e); return null; }
  }

  function fmtTime(s) { const m = Math.floor(s / 60); return `${Math.floor(m / 60) || 0}:${String(m % 60).padStart(2, '0')}`; }
  function fmtPace(speed) { const s = 1000 / speed; return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}/km`; }

  // ── SESSION COLOR ─────────────────────────────────────────
  const sColor = { easy: '#4ADE80', intervals: '#FB923C', tempo: '#22D3EE', long: '#A78BFA', rest: '#64748B', recovery: '#4ADE80' };
  function getSessionColor(type) { return sColor[type] || '#4ADE80'; }

  // ── INJECT STYLES ─────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('pacer-coach-styles')) return;
    const s = document.createElement('style');
    s.id = 'pacer-coach-styles';
    s.textContent = `
      .pc-slide-up { animation: pcSlide 0.38s cubic-bezier(0.32,0.72,0,1) both; }
      .pc-fade-in  { animation: pcFade 0.28s ease both; }
      @keyframes pcSlide { from { transform:translateY(40px); opacity:0; } to { transform:translateY(0); opacity:1; } }
      @keyframes pcFade  { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
      @keyframes pcSpin  { to { transform:rotate(360deg); } }
      .pc-spinner { width:14px;height:14px;border:2px solid rgba(255,255,255,0.15);border-top-color:rgba(255,255,255,0.6);border-radius:50%;animation:pcSpin 0.8s linear infinite; }
      #pacer-morning-modal * { box-sizing:border-box;margin:0;padding:0;font-family:'Inter',-apple-system,sans-serif; }
      #pacer-postrun-modal *  { box-sizing:border-box;margin:0;padding:0;font-family:'Inter',-apple-system,sans-serif; }
      .pc-feel-btn { background:rgba(255,255,255,0.06);border:1.5px solid rgba(255,255,255,0.12);border-radius:12px;padding:14px;cursor:pointer;color:#fff;font-family:'Inter',sans-serif;font-size:14px;font-weight:600;display:flex;align-items:center;gap:8px;transition:all 0.15s;width:100%; }
      .pc-feel-btn:hover { background:rgba(255,255,255,0.1); }
      .pc-feel-btn.selected { border-color:#4F9FFF;background:rgba(79,159,255,0.12); }
    `;
    document.head.appendChild(s);
  }

  // ── MORNING MODAL ─────────────────────────────────────────
  function showMorningModal(text, prefs, cond, session) {
    if (document.getElementById('pacer-morning-modal')) return;
    const col = getSessionColor(session.type);
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    const overlay = document.createElement('div');
    overlay.id = 'pacer-morning-modal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;';

    overlay.innerHTML = `
      <div class="pc-slide-up" style="width:100%;max-width:430px;background:#0F172A;border-radius:24px 24px 0 0;padding:10px 22px 44px;border-top:1px solid rgba(255,255,255,0.08);">
        <div style="width:32px;height:4px;background:rgba(255,255,255,0.18);border-radius:2px;margin:0 auto 22px;"></div>

        <!-- Header -->
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          <div style="width:42px;height:42px;background:rgba(79,159,255,0.12);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">🏃</div>
          <div>
            <p style="font-size:10px;color:rgba(255,255,255,0.3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:3px;">
              Your coach · ${new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})} · ${new Date().toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}
            </p>
            <p style="font-size:16px;font-weight:700;color:#fff;">${greet}, ${prefs.name.split(' ')[0]}</p>
          </div>
        </div>

        <!-- Session card -->
        <div style="background:${col}12;border:1px solid ${col}35;border-radius:14px;padding:14px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;">
          <div>
            <p style="font-size:9px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px;">Today's session</p>
            <p style="font-size:18px;font-weight:800;color:${col};letter-spacing:-0.4px;">${session.type === 'rest' ? 'Rest Day' : session.desc}</p>
          </div>
          ${session.km > 0 ? `<div style="text-align:center;background:${col}18;border-radius:10px;padding:8px 14px;"><p style="font-size:24px;font-weight:900;color:${col};line-height:1;">${session.km}</p><p style="font-size:8px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:1px;margin-top:2px;">km</p></div>` : ''}
        </div>

        <!-- Conditions row -->
        <div style="display:flex;gap:8px;margin-bottom:16px;">
          <div style="flex:1;background:rgba(255,255,255,0.05);border-radius:10px;padding:10px;text-align:center;">
            <p style="font-size:20px;font-weight:800;color:${cond.aqi < 100 ? '#4ADE80' : cond.aqi < 150 ? '#FB923C' : '#ff4444'};">${cond.aqi}</p>
            <p style="font-size:8px;color:rgba(255,255,255,0.25);text-transform:uppercase;letter-spacing:1px;margin-top:2px;">AQI</p>
          </div>
          <div style="flex:1;background:rgba(255,255,255,0.05);border-radius:10px;padding:10px;text-align:center;">
            <p style="font-size:20px;font-weight:800;color:#fff;">${cond.hi}°</p>
            <p style="font-size:8px;color:rgba(255,255,255,0.25);text-transform:uppercase;letter-spacing:1px;margin-top:2px;">Heat Index</p>
          </div>
          <div style="flex:2;background:${cond.vColor}12;border:1px solid ${cond.vColor}35;border-radius:10px;padding:10px;text-align:center;">
            <p style="font-size:16px;font-weight:900;color:${cond.vColor};">${cond.verdict}</p>
            ${cond.thermal > 0 ? `<p style="font-size:9px;color:rgba(255,255,255,0.3);margin-top:2px;">+${cond.thermal}s/km harder</p>` : '<p style="font-size:9px;color:rgba(255,255,255,0.3);margin-top:2px;">Today\'s conditions</p>'}
          </div>
        </div>

        <!-- Briefing text -->
        <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:16px;margin-bottom:20px;min-height:72px;display:flex;align-items:center;" id="pc-briefing-body">
          ${text
            ? `<p style="font-size:14px;color:rgba(255,255,255,0.75);line-height:1.72;font-weight:400;">${text}</p>`
            : `<div style="display:flex;align-items:center;gap:10px;"><div class="pc-spinner"></div><p style="font-size:13px;color:rgba(255,255,255,0.35);">Coach is writing your briefing…</p></div>`
          }
        </div>

        <button id="pc-morning-btn" onclick="document.getElementById('pacer-morning-modal').remove()" style="width:100%;background:#4F9FFF;color:#000;border:none;border-radius:13px;padding:16px;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:-0.2px;">
          Let's go →
        </button>
      </div>
    `;

    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  function updateBriefingBody(text) {
    const el = document.getElementById('pc-briefing-body');
    if (el && text) el.innerHTML = `<p style="font-size:14px;color:rgba(255,255,255,0.75);line-height:1.72;font-weight:400;">${text}</p>`;
  }

  // ── POST-RUN MODAL ────────────────────────────────────────
  function showPostRunModal(run, prefs, cond) {
    if (document.getElementById('pacer-postrun-modal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'pacer-postrun-modal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;';

    overlay.innerHTML = `
      <div class="pc-slide-up" style="width:100%;max-width:430px;background:#0F172A;border-radius:24px 24px 0 0;padding:10px 22px 44px;border-top:1px solid rgba(255,255,255,0.08);">
        <div style="width:32px;height:4px;background:rgba(255,255,255,0.18);border-radius:2px;margin:0 auto 22px;"></div>

        <!-- Header -->
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          <div style="width:42px;height:42px;background:rgba(22,163,74,0.15);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;">✓</div>
          <div>
            <p style="font-size:10px;color:rgba(255,255,255,0.3);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:3px;">New run from Strava</p>
            <p style="font-size:16px;font-weight:700;color:#fff;">${run.dist}${run.t ? ' · ' + run.t : ''}${run.pace ? ' · ' + run.pace : ''}</p>
          </div>
        </div>

        <p style="font-size:14px;color:rgba(255,255,255,0.5);margin-bottom:16px;line-height:1.6;">Coach saw your run. How did it go?</p>

        <!-- Feel buttons -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;" id="pc-feel-grid">
          ${[['💪', 'Strong', 'great'], ['👍', 'Good', 'good'], ['😐', 'Okay', 'okay'], ['😓', 'Tough', 'tough']].map(([e, l, v]) =>
            `<button class="pc-feel-btn" onclick="pcSelectFeel('${v}',this)"><span style="font-size:20px;">${e}</span>${l}</button>`
          ).join('')}
        </div>

        <!-- Analysis result -->
        <div id="pc-analysis" style="display:none;background:rgba(255,255,255,0.04);border-radius:12px;padding:16px;margin-bottom:16px;">
          <p style="font-size:9px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;">Coach says</p>
          <div id="pc-analysis-inner" style="display:flex;align-items:center;gap:10px;"><div class="pc-spinner"></div><p style="font-size:13px;color:rgba(255,255,255,0.35);">Analyzing your run…</p></div>
        </div>

        <button id="pc-postrun-close" onclick="document.getElementById('pacer-postrun-modal').remove()" style="display:none;width:100%;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.65);border:none;border-radius:13px;padding:14px;font-size:14px;font-weight:600;cursor:pointer;">
          Done
        </button>
      </div>
    `;

    window.pcSelectFeel = async (feeling, btn) => {
      document.querySelectorAll('.pc-feel-btn').forEach(b => {
        b.classList.remove('selected');
        b.style.opacity = b === btn ? '1' : '0.35';
      });
      btn.classList.add('selected');

      const analysisEl = document.getElementById('pc-analysis');
      const innerEl = document.getElementById('pc-analysis-inner');
      const closeBtn = document.getElementById('pc-postrun-close');
      analysisEl.style.display = 'block';

      const runLog = getRunLog();
      const text = await generatePostRunAnalysis(run, prefs, cond, feeling, runLog);

      const fallbacks = {
        great: `Strong run — you pushed through conditions (AQI ${cond.aqi}, ${cond.hi}°C heat index). That builds real fitness. Recovery: curd rice or dal within 30 minutes. Next session can maintain intensity.`,
        good: `Solid run. ${cond.thermal > 10 ? `Running in ${cond.hi}°C heat adds real physiological stress — that wasn't easy. ` : ''}Good consistency. Keep the pattern going.`,
        okay: `Average runs are part of training — not every session is a breakthrough. Check sleep and food before the next one. Conditions today added ${cond.thermal || 0}s/km to your effort.`,
        tough: `Tough day. ${cond.verdict !== 'GO RUN' ? 'Conditions were genuinely difficult. ' : 'Could be accumulated fatigue. '}Take tomorrow at easy pace regardless of the plan. Eat and sleep well tonight.`
      };

      const finalText = text || fallbacks[feeling] || fallbacks.good;
      innerEl.innerHTML = `<p style="font-size:14px;color:rgba(255,255,255,0.78);line-height:1.72;">${finalText}</p>`;
      closeBtn.style.display = 'block';
      saveMemory({ lastCoachingNote: finalText, lastRunFeel: feeling, lastRunDate: run.date });
    };

    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // ── HOME SCREEN COACH STRIP ──────────────────────────────
  function injectCoachStrip(briefingText, session, cond) {
    const col = getSessionColor(session.type);

    const tryInject = (attempts) => {
      if (attempts <= 0) return;

      // Remove stale strip
      const old = document.getElementById('pacer-coach-strip-wrap');
      if (old) old.remove();

      // Find the home content container (scrollable div with padding and children)
      const root = document.getElementById('root');
      if (!root) { setTimeout(() => tryInject(attempts - 1), 400); return; }

      // Look for a div that looks like the home screen content
      let target = null;
      const divs = root.querySelectorAll('div');
      for (const d of divs) {
        const style = d.getAttribute('style') || '';
        if (style.includes('paddingBottom') && style.includes('overflow') && d.children.length > 3) {
          target = d;
          break;
        }
      }

      if (!target) { setTimeout(() => tryInject(attempts - 1), 500); return; }

      const wrap = document.createElement('div');
      wrap.id = 'pacer-coach-strip-wrap';
      wrap.className = 'pc-fade-in';
      wrap.style.cssText = 'padding:0 20px;margin-bottom:0;';

      wrap.innerHTML = `
        <div style="background:#0F172A;border-radius:16px;overflow:hidden;margin-bottom:14px;box-shadow:0 4px 20px rgba(15,23,42,0.18);cursor:pointer;" id="pc-strip-card">
          <div style="height:2px;background:linear-gradient(90deg,${col},${col}60);"></div>
          <div style="padding:16px 18px;">
            <!-- Top row: date/time + session name + km -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${briefingText ? '12px' : '0'};">
              <div style="flex:1;min-width:0;margin-right:10px;">
                <p style="font-size:9px;color:rgba(255,255,255,0.28);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;font-family:'Inter',sans-serif;">
                  ${new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})} · ${new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short'})}
                </p>
                <p style="font-size:18px;font-weight:800;color:${col};letter-spacing:-0.4px;font-family:'Inter',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  ${session.type === 'rest' ? 'Rest Day' : session.desc}
                </p>
              </div>
              <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
                ${session.km > 0 ? `<div style="background:${col}18;border-radius:9px;padding:7px 12px;text-align:center;"><p style="font-size:20px;font-weight:900;color:${col};line-height:1;font-family:'Inter',sans-serif;">${session.km}</p><p style="font-size:7px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:1px;margin-top:1px;font-family:'Inter',sans-serif;">km</p></div>` : ''}
                <div style="background:${cond.vColor}12;border:1px solid ${cond.vColor}35;border-radius:9px;padding:7px 10px;text-align:center;">
                  <p style="font-size:12px;font-weight:900;color:${cond.vColor};font-family:'Inter',sans-serif;">${cond.verdict}</p>
                  <p style="font-size:8px;color:rgba(255,255,255,0.25);margin-top:1px;font-family:'Inter',sans-serif;">AQI ${cond.aqi}</p>
                </div>
              </div>
            </div>
            <!-- Coach briefing text -->
            ${briefingText ? `<p style="font-size:13px;color:rgba(255,255,255,0.5);line-height:1.68;font-family:'Inter',sans-serif;font-weight:300;">${briefingText}</p>` : ''}
          </div>
          <!-- Expandable WHY -->
          <div id="pc-strip-why" style="display:none;border-top:1px solid rgba(255,255,255,0.06);padding:14px 18px;">
            <p style="font-size:9px;color:rgba(255,255,255,0.25);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:7px;font-family:'Inter',sans-serif;">Why this session</p>
            <p style="font-size:13px;color:rgba(255,255,255,0.45);line-height:1.68;font-family:'Inter',sans-serif;">${session.why}</p>
          </div>
        </div>
      `;

      // Toggle WHY on tap
      wrap.querySelector('#pc-strip-card').addEventListener('click', () => {
        const why = document.getElementById('pc-strip-why');
        if (why) why.style.display = why.style.display === 'none' ? 'block' : 'none';
      });

      target.insertBefore(wrap, target.firstChild);
    };

    setTimeout(() => tryInject(8), 1200);
  }

  // ── HIDE WHERE TO RUN ON HOME ────────────────────────────
  // (Chirag: moved to Clubs/Explore page)
  function hideWhereToRunHome() {
    const tryHide = () => {
      document.querySelectorAll('div').forEach(el => {
        const t = el.innerText || '';
        if (t.trim() === 'PACER · TOP RUNNING SPOTS' || t.trim() === 'Where to run today') {
          let card = el;
          for (let i = 0; i < 6; i++) {
            if (card.parentElement && (card.style.marginBottom === '14px' || card.getAttribute('style')?.includes('marginBottom:14'))) {
              card.style.display = 'none';
              return;
            }
            card = card.parentElement || card;
          }
        }
      });
    };
    setTimeout(tryHide, 1500);
    setTimeout(tryHide, 3000);
    setTimeout(tryHide, 6000);
  }

  // ── API KEY PROMPT ────────────────────────────────────────
  function showApiKeyPrompt() {
    if (document.getElementById('pacer-key-prompt')) return;
    const bar = document.createElement('div');
    bar.id = 'pacer-key-prompt';
    bar.style.cssText = 'position:fixed;bottom:72px;left:50%;transform:translateX(-50%);background:#0F172A;border:1px solid rgba(79,159,255,0.3);border-radius:12px;padding:12px 16px;z-index:9990;display:flex;align-items:center;gap:10px;max-width:380px;width:calc(100% - 32px);';
    bar.innerHTML = `
      <div style="flex:1;font-family:'Inter',sans-serif;">
        <p style="font-size:12px;font-weight:700;color:#fff;margin-bottom:2px;">Add your Claude API key</p>
        <p style="font-size:11px;color:rgba(255,255,255,0.4);">Profile → Settings → Claude API key</p>
      </div>
      <button onclick="document.getElementById('pacer-key-prompt').remove()" style="background:none;border:none;color:rgba(255,255,255,0.3);cursor:pointer;font-size:18px;line-height:1;padding:4px;">×</button>
    `;
    document.body.appendChild(bar);
    setTimeout(() => bar.remove(), 8000);
  }

  // ── MAIN INIT ─────────────────────────────────────────────
  async function init() {
    injectStyles();

    const prefs = getUserPrefs();
    const cond = getConditions(prefs.city);
    const session = getTodaySession();
    const runLog = getRunLog();
    const hasKey = !!getApiKey();

    // Show API key prompt if missing
    if (!hasKey) {
      setTimeout(showApiKeyPrompt, 3000);
    }

    // Hide Where to Run from home
    hideWhereToRunHome();

    // 1. Auto-sync Strava (background)
    let newRunData = null;
    const stravaToken = localStorage.getItem('pacer_strava_token');
    if (stravaToken) {
      try { newRunData = await autoSyncStrava(); } catch {}
    }

    // 2. Post-run check-in if new runs found
    if (newRunData?.newRuns?.length > 0 && newRunData.latestRun) {
      const lastCheckin = localStorage.getItem('pacer_last_run_checkin');
      if (lastCheckin !== newRunData.latestRun.stravaId?.toString()) {
        localStorage.setItem('pacer_last_run_checkin', String(newRunData.latestRun.stravaId));
        setTimeout(() => showPostRunModal(newRunData.latestRun, prefs, cond), 1200);
        // Still inject coach strip but skip morning modal
        const cached = localStorage.getItem('pacer_cached_briefing_' + todayKey());
        injectCoachStrip(cached || fallbackBriefing(prefs, cond, session, runLog), session, cond);
        return;
      }
    }

    // 3. Morning briefing (once per day)
    const briefingShownToday = localStorage.getItem('pacer_briefing_date') === todayKey();
    const cachedText = localStorage.getItem('pacer_cached_briefing_' + todayKey());

    if (!briefingShownToday) {
      localStorage.setItem('pacer_briefing_date', todayKey());
      showMorningModal(cachedText || null, prefs, cond, session);

      if (!cachedText && hasKey) {
        const text = await generateBriefing(prefs, cond, session, runLog);
        const finalText = text || fallbackBriefing(prefs, cond, session, runLog);
        localStorage.setItem('pacer_cached_briefing_' + todayKey(), finalText);
        updateBriefingBody(finalText);
        injectCoachStrip(finalText, session, cond);
      } else if (cachedText) {
        injectCoachStrip(cachedText, session, cond);
      } else {
        const fb = fallbackBriefing(prefs, cond, session, runLog);
        updateBriefingBody(fb);
        injectCoachStrip(fb, session, cond);
      }
    } else {
      // Not first open — just inject strip
      injectCoachStrip(cachedText || fallbackBriefing(prefs, cond, session, runLog), session, cond);
    }
  }

  // Start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 600));
  } else {
    setTimeout(init, 600);
  }

})();
