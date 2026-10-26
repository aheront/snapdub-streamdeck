// The sign-in block both keys' settings panels share. The plugin does the OAuth; this only asks
// for it and shows the answer.
(function () {
	const client = SDPIComponents.streamDeckClient;
	const status = document.getElementById("signin-status");
	const button = document.getElementById("signin-button");
	let signedIn = false;

	client.sendToPropertyInspector.subscribe((message) => {
		const p = message.payload || {};
		if (p.event !== "session") return;
		if (p.busy) {
			status.textContent = "Finish signing in in your browser...";
			button.disabled = true;
			return;
		}
		button.disabled = false;
		if (p.error) {
			status.textContent = p.error;
			return;
		}
		signedIn = !!p.signedIn;
		status.textContent = signedIn ? "Signed in" + (p.account ? " as " + p.account : "") : "Not signed in. A free account works.";
		button.textContent = signedIn ? "Sign out" : "Sign in with SnapDub";
	});

	button.addEventListener("click", () => client.send("sendToPlugin", { event: signedIn ? "signOut" : "signIn" }));
	client.connected.then(() => client.send("sendToPlugin", { event: "status" }));
})();
