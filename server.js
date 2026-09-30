const express = require('express');
const session = require('express-session');
const { connectDB, getDB, nextId } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'mentorship_secret',
  resave: false,
  saveUninitialized: false
}));

function users() { return getDB().collection('Users'); }
function skills() { return getDB().collection('Skills'); }
function mentorSkills() { return getDB().collection('Mentor_Skills'); }
function studentSkills() { return getDB().collection('Student_Skills'); }
function mentorships() { return getDB().collection('Mentorship'); }
function feedback() { return getDB().collection('Feedback'); }
function sessions() { return getDB().collection('Sessions'); }

/* Registration / Signup */
app.post('/signup', async (req, res) => {
  try {
    const { name, password, role } = req.body;
    if (!name || !password || !role) {
      return res.json({ success: false, error: 'Please fill all fields' });
    }

    const existing = await users().findOne({ name });
    if (existing) {
      return res.json({ success: false, error: 'Username already exists' });
    }

    const id = await nextId('users');
    await users().insertOne({
      user_id: id,
      name,
      password,
      role
    });

    res.json({ success: true, user_id: id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* Login */
app.post('/login', async (req, res) => {
  try {
    const { name, password } = req.body;
    const user = await users().findOne({ name, password });
    if (user) {
      delete user._id;
      req.session.user = user;
      return res.json({ success: true, user });
    }
    res.json({ success: false });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/me', (req, res) => {
  res.json(req.session.user || null);
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

/* Add user */
app.post('/addUser', async (req, res) => {
  try {
    const { user_id, name, role } = req.body;
    const id = user_id ? Number(user_id) : await nextId('users');
    await users().insertOne({ user_id: id, name, role, password: '' });
    res.send('User Added');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/* Smart Matching — find mentors by skill */
app.get('/match/:skill_id', async (req, res) => {
  try {
    const skill_id = Number(req.params.skill_id);
    const rows = await mentorSkills().find({ skill_id }).toArray();
    const mentorIds = rows.map(r => r.mentor_id);
    const mentorUsers = await users().find({ user_id: { $in: mentorIds }, role: 'mentor' }).toArray();

    const result = await Promise.all(mentorUsers.map(async u => {
      const ratings = await feedback().find({ mentor_id: u.user_id }).toArray();
      const rating = ratings.length ? ratings.reduce((sum, f) => sum + Number(f.rating || 0), 0) / ratings.length : null;
      return { user_id: u.user_id, name: u.name, rating };
    }));

    result.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Send Mentorship Request — block duplicate */
app.post('/request', async (req, res) => {
  try {
    const { student_id, mentor_id, skill_id } = req.body;
    const student = Number(student_id), mentor = Number(mentor_id), skill = Number(skill_id);
    const existing = await mentorships().findOne({ student_id: student, mentor_id: mentor, skill_id: skill });
    if (existing) return res.json({ success: false, error: 'Request already exists for this course with this mentor' });

    const mentorship_id = await nextId('mentorships');
    await mentorships().insertOne({ mentorship_id, student_id: student, mentor_id: mentor, skill_id: skill, status: 'pending' });
    res.json({ success: true, mentorship_id });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* Skill Gap Analysis */
app.get('/skill-gap/:student_id/:skill_id', async (req, res) => {
  try {
    const student_id = Number(req.params.student_id);
    const skill_id = Number(req.params.skill_id);
    const target = await skills().findOne({ skill_id });
    if (!target) return res.json([]);

    const deps = await getDB().collection('Skill_Dependency').find({ skill_id }).toArray();
    const owned = await studentSkills().find({ student_id }).toArray();
    const ownedIds = new Set(owned.map(x => x.skill_id));
    const missingIds = deps.map(x => x.prerequisite_skill_id).filter(id => !ownedIds.has(id));
    const result = await skills().find({ skill_id: { $in: missingIds } }).project({ _id: 0, skill_name: 1 }).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Analytics — all mentors with stats */
app.get('/analytics', async (req, res) => {
  try {
    const mentors = await users().find({ role: 'mentor' }).toArray();
    const result = await Promise.all(mentors.map(async u => {
      const accepted = await mentorships().countDocuments({ mentor_id: u.user_id, status: 'accepted' });
      const ratings = await feedback().find({ mentor_id: u.user_id }).toArray();
      const mentorM = await mentorships().find({ mentor_id: u.user_id }).toArray();
      const mIds = mentorM.map(m => m.mentorship_id);
      const sess = mIds.length ? await sessions().find({ mentorship_id: { $in: mIds } }).toArray() : [];
      const rating = ratings.length ? ratings.reduce((sum, f) => sum + Number(f.rating || 0), 0) / ratings.length : null;
      const hours = sess.reduce((sum, s) => sum + Number(s.duration || 0), 0);
      return { user_id: u.user_id, mentor_id: u.user_id, name: u.name, students: accepted, rating, hours };
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* My Students */
app.get('/my-students/:mentor_id', async (req, res) => {
  try {
    const mentor_id = Number(req.params.mentor_id);
    const accepted = await mentorships().find({ mentor_id, status: 'accepted' }).toArray();
    const result = [];
    const seen = new Set();
    for (const m of accepted) {
      const key = `${m.student_id}-${m.skill_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const u = await users().findOne({ user_id: m.student_id });
      const sk = await skills().findOne({ skill_id: m.skill_id });
      if (u) result.push({ user_id: u.user_id, name: u.name, skill_name: sk?.skill_name, skill_id: m.skill_id });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Add Mentor Skill */
app.post('/add-mentor-skill', async (req, res) => {
  try {
    const { mentor_id, skill_id } = req.body;
    await mentorSkills().updateOne(
      { mentor_id: Number(mentor_id), skill_id: Number(skill_id) },
      { $setOnInsert: { mentor_id: Number(mentor_id), skill_id: Number(skill_id) } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* Update request status */
app.post('/request/update', async (req, res) => {
  try {
    const { mentorship_id, status } = req.body;
    await mentorships().updateOne({ mentorship_id: Number(mentorship_id) }, { $set: { status } });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* Incoming requests */
app.get('/requests/incoming/:mentor_id', async (req, res) => {
  try {
    const mentor_id = Number(req.params.mentor_id);
    const list = await mentorships().find({ mentor_id, status: 'pending' }).sort({ mentorship_id: -1 }).toArray();
    const result = [];
    for (const m of list) {
      const u = await users().findOne({ user_id: m.student_id });
      const sk = await skills().findOne({ skill_id: m.skill_id });
      result.push({ mentorship_id: m.mentorship_id, status: m.status, skill_id: m.skill_id, name: u?.name, user_id: u?.user_id, skill_name: sk?.skill_name });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Requests sent by a student */
app.get('/requests/sent/:student_id', async (req, res) => {
  try {
    const student_id = Number(req.params.student_id);
    const list = await mentorships().find({ student_id }).sort({ mentorship_id: -1 }).toArray();
    const result = [];
    for (const m of list) {
      const u = await users().findOne({ user_id: m.mentor_id });
      const sk = await skills().findOne({ skill_id: m.skill_id });
      const ratings = await feedback().find({ mentor_id: m.mentor_id }).toArray();
      const rating = ratings.length ? ratings.reduce((sum, f) => sum + Number(f.rating || 0), 0) / ratings.length : null;
      result.push({ mentorship_id: m.mentorship_id, status: m.status, skill_id: m.skill_id, mentor_name: u?.name, mentor_id: u?.user_id, skill_name: sk?.skill_name, rating });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Get skills of a mentor */
app.get('/mentor-skills/:mentor_id', async (req, res) => {
  try {
    const mentor_id = Number(req.params.mentor_id);
    const rows = await mentorSkills().find({ mentor_id }).toArray();
    const result = [];
    for (const r of rows) {
      const s = await skills().findOne({ skill_id: r.skill_id });
      if (s) result.push({ skill_id: s.skill_id, skill_name: s.skill_name });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Get skills of a student */
app.get('/student-skills/:student_id', async (req, res) => {
  try {
    const student_id = Number(req.params.student_id);
    const rows = await studentSkills().find({ student_id }).toArray();
    const result = [];
    for (const r of rows) {
      const s = await skills().findOne({ skill_id: r.skill_id });
      if (s) result.push({ skill_id: s.skill_id, skill_name: s.skill_name });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Find skill by name */
app.get('/skill-by-name/:name', async (req, res) => {
  try {
    const name = req.params.name;
    const result = await skills().find({ skill_name: { $regex: name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }).project({ _id: 0 }).toArray();
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* Submit feedback */
app.post('/feedback', async (req, res) => {
  try {
    const { mentor_id, student_id, skill_id, rating, comment } = req.body;
    await feedback().updateOne(
      { mentor_id: Number(mentor_id), student_id: Number(student_id), skill_id: Number(skill_id) },
      { $set: { mentor_id: Number(mentor_id), student_id: Number(student_id), skill_id: Number(skill_id), rating: Number(rating), comment: comment || '' } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

function requireAdmin(req, res, next) { next(); }

/* Admin: Get all users */
app.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const result = await users().find({}, { projection: { _id: 0, user_id: 1, name: 1, role: 1 } }).sort({ user_id: 1 }).toArray();
    res.json(result);
  } catch { res.json([]); }
});

/* Get feedback for a mentor */
app.get('/feedback/:mentor_id', async (req, res) => {
  try {
    const list = await feedback().find({ mentor_id: Number(req.params.mentor_id) }).toArray();
    const result = [];
    for (const f of list) {
      const u = await users().findOne({ user_id: f.student_id });
      result.push({ rating: f.rating, comment: f.comment, student_name: u?.name || 'Unknown' });
    }
    res.json(result);
  } catch { res.json([]); }
});

/* Get ALL mentorships (Admin) */
app.get('/admin/mentorships', async (req, res) => {
  try {
    const list = await mentorships().find({}).sort({ mentorship_id: -1 }).toArray();
    const result = [];
    for (const m of list) {
      const student = await users().findOne({ user_id: m.student_id });
      const mentor = await users().findOne({ user_id: m.mentor_id });
      result.push({ mentorship_id: m.mentorship_id, status: m.status, student_id: m.student_id, student_name: student?.name, mentor_id: m.mentor_id, mentor_name: mentor?.name });
    }
    res.json(result);
  } catch { res.json([]); }
});

/* Recent mentorships */
app.get('/admin/recent-mentorships', async (req, res) => {
  try {
    const list = await mentorships().find({}).sort({ mentorship_id: -1 }).limit(6).toArray();
    const result = [];
    for (const m of list) {
      const student = await users().findOne({ user_id: m.student_id });
      const mentor = await users().findOne({ user_id: m.mentor_id });
      result.push({ mentorship_id: m.mentorship_id, status: m.status, student_name: student?.name, mentor_name: mentor?.name });
    }
    res.json(result);
  } catch { res.json([]); }
});

/* Get sessions for a mentor */
app.get('/sessions/:mentor_id', async (req, res) => {
  try {
    const mentor_id = Number(req.params.mentor_id);
    const mList = await mentorships().find({ mentor_id }).toArray();
    const ids = mList.map(m => m.mentorship_id);
    const list = ids.length ? await sessions().find({ mentorship_id: { $in: ids } }).sort({ session_date: -1 }).toArray() : [];
    const result = [];
    for (const s of list) {
      const m = mList.find(x => x.mentorship_id === s.mentorship_id);
      const student = m ? await users().findOne({ user_id: m.student_id }) : null;
      const sk = m ? await skills().findOne({ skill_id: m.skill_id }) : null;
      result.push({ session_id: s.session_id, duration: s.duration, session_date: s.session_date, student_name: student?.name, skill_name: sk?.skill_name, mentorship_id: s.mentorship_id });
    }
    res.json(result);
  } catch { res.json([]); }
});

async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('MongoDB Connection Failed:', err.message);
    console.error('Make sure MongoDB is running or set MONGODB_URI to your MongoDB Atlas connection string.');
    process.exit(1);
  }
}

start();
