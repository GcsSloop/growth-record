async function checkSession() {
  const statusNode = document.getElementById("authGate");
  if (!statusNode) return;

  try {
    const response = await fetch("/api/me", { credentials: "include" });
    if (response.status === 501) {
      statusNode.dataset.state = "planned";
      return;
    }
    if (!response.ok) statusNode.dataset.state = "guest";
    else statusNode.dataset.state = "authenticated";
  } catch {
    statusNode.dataset.state = "offline";
  }
}

void checkSession();
