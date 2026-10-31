export type Shell = "zsh" | "bash";

const HOOKS: Record<Shell, string> = {
  zsh: `_nenv_hook() {
  local revision=""
  [[ -n "$_NENV_REV_FILE" && -r "$_NENV_REV_FILE" ]] && revision="$(<"$_NENV_REV_FILE")"
  if [[ "$PWD" != "$_NENV_PWD" || -n "$_NENV_RETRY" || "$revision" != "$_NENV_REV" ]]; then
    _NENV_PWD="$PWD"
    eval "$(printf '%s' "$_NENV_STATE" | command nenv hook-env zsh)"
  fi
}
typeset -ag precmd_functions chpwd_functions
if (( ! \${precmd_functions[(I)_nenv_hook]} )); then precmd_functions=(_nenv_hook $precmd_functions); fi
if (( ! \${chpwd_functions[(I)_nenv_hook]} )); then chpwd_functions=(_nenv_hook $chpwd_functions); fi
`,
  bash: `_nenv_hook() {
  local previous_exit=$? revision=""
  [[ -n "$_NENV_REV_FILE" && -r "$_NENV_REV_FILE" ]] && revision="$(<"$_NENV_REV_FILE")"
  if [[ "$PWD" != "$_NENV_PWD" || -n "$_NENV_RETRY" || "$revision" != "$_NENV_REV" ]]; then
    _NENV_PWD="$PWD"
    eval "$(printf '%s' "$_NENV_STATE" | command nenv hook-env bash)"
  fi
  return $previous_exit
}
if [[ ";\${PROMPT_COMMAND:-};" != *";_nenv_hook;"* ]]; then
  PROMPT_COMMAND="_nenv_hook\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
fi
`,
};

export function parseShell(value: string | undefined): Shell {
  if (value !== "zsh" && value !== "bash") {
    throw new Error("shell must be zsh or bash");
  }
  return value;
}

export function hookScript(shell: Shell): string {
  return HOOKS[shell];
}

export function quote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function exportLine(name: string, value: string): string {
  return `export ${name}=${quote(value)}`;
}

export function setLine(name: string, value: string): string {
  return `${name}=${quote(value)}`;
}

export function unsetLine(name: string): string {
  return `unset ${name}`;
}
