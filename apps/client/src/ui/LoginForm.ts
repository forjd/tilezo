type LoginValues = {
  mode: "login" | "register";
  username: string;
  password: string;
};

export class LoginForm {
  readonly element = document.createElement("section");

  private readonly username = document.createElement("input");
  private readonly password = document.createElement("input");
  private readonly confirmPassword = document.createElement("input");
  private readonly confirmPasswordField = this.createField(
    "Confirm password",
    this.confirmPassword,
  );
  private readonly message = document.createElement("p");
  private readonly loginModeButton = document.createElement("button");
  private readonly registerModeButton = document.createElement("button");
  private readonly submitButton = document.createElement("button");
  private mode: LoginValues["mode"] = "login";

  constructor(private readonly onSubmit: (values: LoginValues) => void) {
    this.element.className = "login-panel";
    this.element.innerHTML = "";

    const header = document.createElement("header");
    const title = document.createElement("h1");
    const intro = document.createElement("p");
    header.className = "login-header";
    title.textContent = "Enter Tilezo";
    intro.textContent = "Sign in or create a room identity.";
    header.append(title, intro);

    this.message.className = "login-message";

    const form = document.createElement("form");
    form.autocomplete = "on";
    const modeGroup = document.createElement("div");
    modeGroup.className = "mode-toggle";
    this.loginModeButton.type = "button";
    this.loginModeButton.textContent = "Log in";
    this.registerModeButton.type = "button";
    this.registerModeButton.textContent = "Create";
    modeGroup.append(this.loginModeButton, this.registerModeButton);

    form.append(
      modeGroup,
      this.createField("Username", this.username),
      this.createField("Password", this.password),
      this.confirmPasswordField,
    );

    this.submitButton.className = "primary-button";
    this.submitButton.type = "submit";
    form.append(this.submitButton);

    this.username.maxLength = 24;
    this.username.name = "tilezo-username";
    this.username.required = true;
    this.username.autocomplete = "username";

    this.password.name = "tilezo-password";
    this.password.required = true;
    this.password.type = "password";
    this.password.autocomplete = "current-password";

    this.confirmPassword.name = "tilezo-confirm-password";
    this.confirmPassword.type = "password";
    this.confirmPassword.autocomplete = "new-password";

    this.loginModeButton.addEventListener("click", () => this.setMode("login"));
    this.registerModeButton.addEventListener("click", () => this.setMode("register"));
    this.setMode("login");

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.clearError();
      const username = this.username.value.trim();
      const password = this.password.value;
      const confirmPassword = this.confirmPassword.value;

      if (!username || !password) {
        return;
      }

      if (this.mode === "register" && password !== confirmPassword) {
        this.showError("Passwords do not match");
        return;
      }

      this.onSubmit({ mode: this.mode, username, password });
    });

    this.element.append(header, this.message, form);
  }

  hide(): void {
    this.element.classList.add("hidden");
    this.password.blur?.();
  }

  showError(message: string): void {
    this.message.textContent = message;
    this.message.classList.add("visible");
  }

  clearError(): void {
    this.message.textContent = "";
    this.message.classList.remove("visible");
  }

  private setMode(mode: LoginValues["mode"]): void {
    this.mode = mode;
    this.submitButton.textContent = mode === "register" ? "Create account" : "Continue";
    this.password.autocomplete = mode === "register" ? "new-password" : "current-password";
    this.confirmPassword.required = mode === "register";
    this.confirmPassword.value = "";
    this.confirmPasswordField.classList[mode === "register" ? "remove" : "add"]("hidden");
    this.loginModeButton.classList[mode === "login" ? "add" : "remove"]("active");
    this.registerModeButton.classList[mode === "register" ? "add" : "remove"]("active");
    this.loginModeButton.setAttribute("aria-pressed", String(mode === "login"));
    this.registerModeButton.setAttribute("aria-pressed", String(mode === "register"));
    this.clearError();
  }

  private createField(labelText: string, input: HTMLInputElement): HTMLLabelElement {
    const label = document.createElement("label");
    const labelContent = document.createElement("span");
    label.className = "field";
    labelContent.textContent = labelText;
    label.append(labelContent, input);
    return label;
  }
}
