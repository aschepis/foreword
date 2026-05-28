# Local Review - Review your code effectively before creating that PR

With the increase in agentic coding and the usage of AI to write vast majorities of actual coding, the focus of rigor has moved to the code review. Most important among this is the code review done by yourself before pushing your code onto your colleagues to review or your customers to use.

Local review is meant to be a tool that helps you to review your code. 

## Requirements

- it runs a webserver that defaults to port 3200
- data is stored in a local sqlite server
- user can add a folder. it must be a git repo. if the git repo has worktrees it should enumerate those
- user can select any branch and generate the diff from that.
  - The diff ui must be beautiful and usable and have modern review features like:
    - marking a file reviewed (unless it has changed since last review)
    - history of reviews
    - threaded comments
    - beautiful diff on par with diff2html and github diffs
    - options for diff to hide whitespace changes
- webserver should be able to shell out to agents for agentic code review
  - user should be able to configure tools and prompts for this.
- agentic code review comments should be highlighted in the diff. if the location cannot be identified they should be placed in a "comments" section that is global.

## Implementation

leverage as much off the shelf open source software as possible.
choose the stack that makes this the easiest to build.

## Existing tools to model after:

- diff2html https://diff2html.xyz/