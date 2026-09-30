# Alumni Mentorship Management System - MongoDB Version

This version replaces MySQL with MongoDB and keeps the existing frontend and API routes.

## Run locally
1. Install Node.js and MongoDB Community Server, or use MongoDB Atlas.
2. Copy `.env.example` to `.env` and set `MONGODB_URI` if needed.
3. Run `npm install`.
4. Run `npm start`.
5. Open http://localhost:3000/login.html

Default local MongoDB:
- URI: mongodb://127.0.0.1:27017
- Database: mentorship

Collections used: Users, Skills, Mentor_Skills, Student_Skills, Skill_Dependency, Mentorship, Feedback, Sessions, and _counters.

## Ex.10
`pip install selenium`, keep the Node server running, then `python selenium_test.py`.

## Ex.11
Run `npm test`, then push to GitHub. `.github/workflows/ci.yml` runs the tests automatically.
