async function getBackendStatus() {
  const statusBox = document.getElementById("backend-status");

  try {
    const res = await fetch("https://aervo-backend.onrender.com/api/status");
    const data = await res.json();

    statusBox.innerText = `Backend: ${data.status.toUpperCase()} (${data.environment})`;
    statusBox.style.color = "lime";
  } catch (err) {
    statusBox.innerText = "Backend: OFFLINE";
    statusBox.style.color = "red";
  }
}

document.addEventListener("DOMContentLoaded", getBackendStatus);