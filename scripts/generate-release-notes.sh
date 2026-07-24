#!/usr/bin/env bash

set -euo pipefail

from_ref=""
to_ref="HEAD"
repository="${GITHUB_REPOSITORY:-}"
offline=false
exclude_commits="${RELEASE_NOTES_EXCLUDE_COMMITS:-}"

usage() {
    echo "Usage: $0 --from <commit> [--to <commit>] [--repository <owner/repo>] [--exclude <hashes>] [--offline]" >&2
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --from)
            from_ref="${2:-}"
            shift 2
            ;;
        --to)
            to_ref="${2:-}"
            shift 2
            ;;
        --repository)
            repository="${2:-}"
            shift 2
            ;;
        --exclude)
            exclude_commits="${exclude_commits} ${2:-}"
            shift 2
            ;;
        --offline)
            offline=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            usage
            exit 1
            ;;
    esac
done

if [[ -z "$from_ref" ]]; then
    usage
    exit 1
fi

git cat-file -e "${from_ref}^{commit}" 2>/dev/null || {
    echo "Unknown starting commit: ${from_ref}" >&2
    exit 1
}
git cat-file -e "${to_ref}^{commit}" 2>/dev/null || {
    echo "Unknown ending commit: ${to_ref}" >&2
    exit 1
}

is_excluded_hash() {
    local commit="$1"
    local excluded
    for excluded in ${exclude_commits//,/ }; do
        [[ -n "$excluded" ]] || continue
        if [[ "$commit" == "$excluded"* ]]; then
            return 0
        fi
    done
    return 1
}

is_release_note() {
    local subject_lower
    local version_bump_pattern='^(bump([[:space:]].*)?version|version[[:space:]]+bump)([[:space:]].*)?$'
    local cleanup_pattern='^cleanup([[:space:][:punct:]].*)?$'
    local conventional_noise_pattern='^(build|chore|ci|docs|style|test)(\([^)]*\))?:'
    subject_lower="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"

    [[ "$subject_lower" != *"[skip release notes]"* ]] || return 1
    [[ ! "$subject_lower" =~ $version_bump_pattern ]] || return 1
    [[ ! "$subject_lower" =~ $cleanup_pattern ]] || return 1
    [[ ! "$subject_lower" =~ $conventional_noise_pattern ]] || return 1
    return 0
}

resolve_username() {
    local commit="$1"
    local author_name="$2"
    local author_email="$3"
    local username=""

    if [[ "$author_email" =~ ^[0-9]+\+([^@]+)@users\.noreply\.github\.com$ ]]; then
        username="${BASH_REMATCH[1]}"
    elif [[ "$author_email" =~ ^([^@]+)@users\.noreply\.github\.com$ ]]; then
        username="${BASH_REMATCH[1]}"
    elif [[ "$offline" == false && -n "$repository" && -n "${GH_TOKEN:-}" ]] && command -v gh >/dev/null 2>&1; then
        username="$(gh api "repos/${repository}/commits/${commit}" --jq '.author.login // empty' 2>/dev/null || true)"
        if [[ -z "$username" ]]; then
            username="$(
                gh api \
                    -H 'Accept: application/vnd.github+json' \
                    "repos/${repository}/commits/${commit}/pulls" \
                    --jq '.[0].user.login // empty' \
                    2>/dev/null \
                    || true
            )"
        fi
    fi

    if [[ -z "$username" ]]; then
        username="$(printf '%s' "$author_name" | tr -cd '[:alnum:]_-')"
    fi
    printf '%s' "${username:-unknown}"
}

seen_subjects=$'\n'
separator=$'\x1f'

while IFS="$separator" read -r commit short_hash subject author_name author_email; do
    [[ -n "$commit" ]] || continue
    is_excluded_hash "$commit" && continue
    is_release_note "$subject" || continue

    normalized_subject="$(printf '%s' "$subject" | tr '[:upper:]' '[:lower:]' | sed -E 's/[[:space:]]+/ /g; s/[[:space:].]+$//')"
    [[ "$seen_subjects" != *$'\n'"$normalized_subject"$'\n'* ]] || continue
    seen_subjects+="${normalized_subject}"$'\n'

    display_subject="$(printf '%s' "$subject" | sed -E 's/[[:space:]]+$//; s/\.$//')"
    username="$(resolve_username "$commit" "$author_name" "$author_email")"
    printf '%s %s @%s  \n' "$short_hash" "$display_subject" "$username"
done < <(
    git log "${from_ref}..${to_ref}" --no-merges \
        --format="%H${separator}%h${separator}%s${separator}%an${separator}%ae"
)
