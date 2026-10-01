// The commit convention (Conventional Commits), checked on each local commit message (.husky/commit-msg)
// and on each pull request title (.github/workflows/pr-title.yml): with squash merges, the pull request
// title becomes the commit title on main and a line of the changelog. Bodies carry tables, links and
// command output, so their line length is not limited; a subject may start with a name ("Perfect UI ..."),
// so its case is free.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
    "subject-case": [0],
  },
};
