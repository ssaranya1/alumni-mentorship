async function addUser() {
  const name = document.getElementById("name").value;
  const role = document.getElementById("role").value;

  await fetch("/addUser", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ name, role })
  });

  alert("User Added");
}

async function findMentor() {
  const skill = document.getElementById("skill").value;

  const res = await fetch(`/match/${skill}`);
  const data = await res.json();

  let output = "";

  if (data.length === 0) {
    output = "No mentors found";
  } else {
    data.forEach(m => {
      output += `
        <div class="card">
          <h3>${m.name}</h3>
          <p>⭐ Rating: ${m.rating || "No rating"}</p>
          <p>ID: ${m.user_id}</p>
        </div>
      `;
    });
  }

  document.getElementById("output").innerHTML = output;
}

async function sendRequest() {
  const student_id = document.getElementById("student").value;
  const mentor_id = document.getElementById("mentor").value;
  const skill_id = document.getElementById("skillReq").value;

  await fetch("/request", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ student_id, mentor_id, skill_id })
  });

  alert("Request Sent!");
}

async function skillGap() {
  const student = localStorage.getItem("user_id"); // ← uses logged-in student's ID
  const skill = document.getElementById("sg_skill").value;

  const res = await fetch(`/skill-gap/${student}/${skill}`);
  const data = await res.json();

  let output = "";
  data.forEach(item => {
    output += "• " + item.skill_name + "\n";
  });

  document.getElementById("gapOutput").innerText = output;
}

async function login() {
  const name = document.getElementById("login_name").value;
  const password = document.getElementById("login_pass").value;

  const res = await fetch("/login", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ name, password })
  });

  const data = await res.json();

  if (data.success) {
    localStorage.setItem("user_id", data.user.user_id); // ← save user ID on login
    window.location.href = "index.html";
  } else {
    alert("Invalid Credentials");
  }
}

async function loadDashboard() {
  const res = await fetch("/analytics");
  const data = await res.json();

  console.log("Analytics Data:", data);

  let output = "";

  if (data.length === 0) {
    output = "No analytics data found";
  } else {
    data.forEach(d => {
      output += `
        <div class="card">
          <h3>Mentor ID: ${d.mentor_id}</h3>
          <p>Students: ${d.students}</p>
          <p>Rating: ${parseFloat(d.rating).toFixed(1)}</p>
          <p>Hours: ${d.hours}</p>
        </div>
      `;
    });
  }

  document.getElementById("dashboard").innerHTML = output;
}