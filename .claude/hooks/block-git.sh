input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"
[ -z "$cmd" ] && exit 0

if printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_-])git([[:space:]]|$)'; then
  if printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])(commit|push|reset|rebase|merge|checkout|switch|branch|tag|stash|clean|restore|cherry-pick|revert|worktree|am|init|rm|mv|pull|fetch|gc|filter-branch|update-ref)([[:space:]]|$)'; then
    echo "Bloqueado: operações git que alteram estado exigem permissão do usuário. Sugira o comando/mensagem e aguarde." >&2
    exit 2
  fi
fi
exit 0
