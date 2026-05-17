import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const REPO_ROOT = resolve(__dirname, '..')
const WORKFLOWS_DIR = resolve(REPO_ROOT, '.github', 'workflows')

function readWorkflow(filename: string): string {
  return readFileSync(resolve(WORKFLOWS_DIR, filename), 'utf-8')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if `content` contains every string in `needles`. */
function containsAll(content: string, needles: string[]): boolean {
  return needles.every((n) => content.includes(n))
}

// ---------------------------------------------------------------------------
// claude-code-review.yml
// ---------------------------------------------------------------------------

describe('claude-code-review.yml', () => {
  let content: string

  beforeAll(() => {
    content = readWorkflow('claude-code-review.yml')
  })

  // --- Workflow metadata ---

  it('has the correct workflow name', () => {
    expect(content).toContain('name: Claude Code Review')
  })

  // --- Triggers ---

  it('triggers on pull_request events', () => {
    expect(content).toContain('pull_request:')
  })

  it('triggers on pull_request type: opened', () => {
    expect(content).toMatch(/types:\s*\[.*opened.*\]/)
  })

  it('triggers on pull_request type: synchronize', () => {
    expect(content).toContain('synchronize')
  })

  it('triggers on pull_request type: ready_for_review', () => {
    expect(content).toContain('ready_for_review')
  })

  it('triggers on pull_request type: reopened', () => {
    expect(content).toContain('reopened')
  })

  it('does NOT trigger on other unintended events like push', () => {
    // The workflow should only listen to pull_request, not push or schedule
    const lines = content.split('\n')
    const onBlock: string[] = []
    let inOnBlock = false
    for (const line of lines) {
      if (/^on:/.test(line)) {
        inOnBlock = true
        continue
      }
      if (inOnBlock && /^\S/.test(line) && !/^\s/.test(line)) break
      if (inOnBlock) onBlock.push(line)
    }
    const onSection = onBlock.join('\n')
    expect(onSection).not.toContain('push:')
    expect(onSection).not.toContain('schedule:')
  })

  // --- Job definition ---

  it('defines a job named claude-review', () => {
    expect(content).toContain('claude-review:')
  })

  it('runs on ubuntu-latest', () => {
    expect(content).toContain('runs-on: ubuntu-latest')
  })

  // --- Permissions ---

  it('grants contents: write permission', () => {
    expect(content).toContain('contents: write')
  })

  it('grants pull-requests: write permission', () => {
    expect(content).toContain('pull-requests: write')
  })

  it('grants issues: write permission', () => {
    expect(content).toContain('issues: write')
  })

  it('grants id-token: write permission', () => {
    expect(content).toContain('id-token: write')
  })

  // --- Steps ---

  it('has a checkout step', () => {
    expect(content).toContain('Checkout repository')
  })

  it('uses a pinned SHA for actions/checkout', () => {
    expect(content).toContain('actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5')
  })

  it('has a version comment for the checkout action', () => {
    expect(content).toContain('actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4')
  })

  it('checks out with fetch-depth: 1', () => {
    expect(content).toContain('fetch-depth: 1')
  })

  it('has a step named "Run Claude Code Review"', () => {
    expect(content).toContain('name: Run Claude Code Review')
  })

  it('assigns the step id "claude-review"', () => {
    expect(content).toContain('id: claude-review')
  })

  it('uses a pinned SHA for anthropics/claude-code-action', () => {
    expect(content).toContain(
      'anthropics/claude-code-action@99ca333651aa9a8becc279065fad21c4ef1c4494',
    )
  })

  it('has a version comment for the claude-code-action', () => {
    expect(content).toContain(
      'anthropics/claude-code-action@99ca333651aa9a8becc279065fad21c4ef1c4494 # v1',
    )
  })

  // --- Action inputs ---

  it('provides claude_code_oauth_token from secrets', () => {
    expect(content).toContain('claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}')
  })

  it('configures plugin_marketplaces pointing to the claude-code GitHub repo', () => {
    expect(content).toContain(
      "plugin_marketplaces: 'https://github.com/anthropics/claude-code.git'",
    )
  })

  it('specifies the code-review plugin', () => {
    expect(content).toContain("plugins: 'code-review@claude-code-plugins'")
  })

  it('sets a prompt that includes /code-review:code-review', () => {
    expect(content).toContain('/code-review:code-review')
  })

  it('prompt references the github.repository context variable', () => {
    expect(content).toContain('${{ github.repository }}')
  })

  it('prompt includes the pull request number', () => {
    expect(content).toContain('${{ github.event.pull_request.number }}')
  })

  it('prompt constructs a valid pull request URL fragment', () => {
    expect(content).toContain(
      '${{ github.repository }}/pull/${{ github.event.pull_request.number }}',
    )
  })

  // --- Negative / boundary cases ---

  it('does NOT expose any hardcoded secrets or tokens', () => {
    // The token value should only come from secrets context, never hardcoded
    expect(content).not.toMatch(/claude_code_oauth_token:\s*['"]?[a-zA-Z0-9_-]{20,}/)
  })

  it('does NOT have an if condition on the job (runs for all matching PR events)', () => {
    // The job-level if is commented out, so there should be no active job-level if
    const lines = content.split('\n')
    const jobLineIdx = lines.findIndex((l) => l.includes('claude-review:'))
    // Look at the next few lines after job definition for an uncommented `if:`
    const jobBlock = lines.slice(jobLineIdx + 1, jobLineIdx + 5).join('\n')
    // Any `if:` in the job block would not be a comment-only line
    const hasActiveIf = jobBlock
      .split('\n')
      .some((l) => /^\s+if:/.test(l) && !l.trimStart().startsWith('#'))
    expect(hasActiveIf).toBe(false)
  })

  it('file is not empty', () => {
    expect(content.trim().length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// claude.yml
// ---------------------------------------------------------------------------

describe('claude.yml', () => {
  let content: string

  beforeAll(() => {
    content = readWorkflow('claude.yml')
  })

  // --- Workflow metadata ---

  it('has the correct workflow name', () => {
    expect(content).toContain('name: Claude Code')
  })

  // --- Triggers ---

  it('triggers on issue_comment:created', () => {
    expect(content).toContain('issue_comment:')
    expect(content).toContain('created')
  })

  it('triggers on pull_request_review_comment:created', () => {
    expect(content).toContain('pull_request_review_comment:')
  })

  it('triggers on issues events (opened and assigned)', () => {
    expect(content).toContain('issues:')
    expect(content).toContain('opened')
    expect(content).toContain('assigned')
  })

  it('triggers on pull_request_review:submitted', () => {
    expect(content).toContain('pull_request_review:')
    expect(content).toContain('submitted')
  })

  it('covers all four expected event types in the on: block', () => {
    expect(
      containsAll(content, [
        'issue_comment:',
        'pull_request_review_comment:',
        'issues:',
        'pull_request_review:',
      ]),
    ).toBe(true)
  })

  // --- Job definition ---

  it('defines a job named claude', () => {
    expect(content).toContain('  claude:')
  })

  it('runs on ubuntu-latest', () => {
    expect(content).toContain('runs-on: ubuntu-latest')
  })

  // --- Job condition (if:) ---

  it('has a job-level if condition', () => {
    expect(content).toMatch(/^\s+if:/m)
  })

  it('job condition checks issue_comment events for @claude', () => {
    expect(content).toContain(
      "github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')",
    )
  })

  it('job condition checks pull_request_review_comment events for @claude', () => {
    expect(content).toContain(
      "github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude')",
    )
  })

  it('job condition checks pull_request_review events for @claude in review body', () => {
    expect(content).toContain(
      "github.event_name == 'pull_request_review' && contains(github.event.review.body, '@claude')",
    )
  })

  it('job condition checks issues events for @claude in issue body', () => {
    expect(content).toContain("contains(github.event.issue.body, '@claude')")
  })

  it('job condition checks issues events for @claude in issue title', () => {
    expect(content).toContain("contains(github.event.issue.title, '@claude')")
  })

  it('job condition uses OR to combine all event checks', () => {
    // Each branch separated by ||
    const matches = [...content.matchAll(/\|\|/g)]
    // At least 3 || operators to join 4 conditions
    expect(matches.length).toBeGreaterThanOrEqual(3)
  })

  it('job condition checks both body and title for issues event', () => {
    // The issues branch must include both body and title checks joined by ||
    const issuesBranch = content.match(
      /github\.event_name == 'issues' && \(contains\(github\.event\.issue\.body, '@claude'\) \|\| contains\(github\.event\.issue\.title, '@claude'\)\)/,
    )
    expect(issuesBranch).not.toBeNull()
    if (issuesBranch) {
      expect(issuesBranch[0]).toContain("contains(github.event.issue.body, '@claude')")
      expect(issuesBranch[0]).toContain("contains(github.event.issue.title, '@claude')")
    }
  })

  // --- Permissions ---

  it('grants contents: write permission', () => {
    expect(content).toContain('contents: write')
  })

  it('grants pull-requests: write permission', () => {
    expect(content).toContain('pull-requests: write')
  })

  it('grants issues: write permission', () => {
    expect(content).toContain('issues: write')
  })

  it('grants id-token: write permission', () => {
    expect(content).toContain('id-token: write')
  })

  it('grants actions: read permission', () => {
    expect(content).toContain('actions: read')
  })

  it('has a comment explaining why actions: read is needed', () => {
    expect(content).toContain('Required for Claude to read CI results on PRs')
  })

  // --- Steps ---

  it('has a checkout step', () => {
    expect(content).toContain('Checkout repository')
  })

  it('uses a pinned SHA for actions/checkout', () => {
    expect(content).toContain('actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5')
  })

  it('has a version comment for the checkout action', () => {
    expect(content).toContain('actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4')
  })

  it('checks out with fetch-depth: 1', () => {
    expect(content).toContain('fetch-depth: 1')
  })

  it('has a step named "Run Claude Code"', () => {
    expect(content).toContain('name: Run Claude Code')
  })

  it('assigns the step id "claude"', () => {
    expect(content).toContain('id: claude')
  })

  it('uses a pinned SHA for anthropics/claude-code-action', () => {
    expect(content).toContain(
      'anthropics/claude-code-action@99ca333651aa9a8becc279065fad21c4ef1c4494',
    )
  })

  it('has a version comment for the claude-code-action', () => {
    expect(content).toContain(
      'anthropics/claude-code-action@99ca333651aa9a8becc279065fad21c4ef1c4494 # v1',
    )
  })

  // --- Action inputs ---

  it('provides claude_code_oauth_token from secrets', () => {
    expect(content).toContain('claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}')
  })

  it('sets additional_permissions to allow reading actions', () => {
    expect(content).toContain('additional_permissions:')
    // The value is a multi-line string with actions: read
    const afterAdditional = content.split('additional_permissions:')[1]
    expect(afterAdditional).toContain('actions: read')
  })

  // --- Negative / boundary cases ---

  it('does NOT expose any hardcoded secrets or tokens', () => {
    expect(content).not.toMatch(/claude_code_oauth_token:\s*['"]?[a-zA-Z0-9_-]{20,}/)
  })

  it('does NOT have a hardcoded prompt (prompt is optional, left commented out)', () => {
    // Active (uncommented) prompt: lines should not appear
    const lines = content.split('\n')
    const activePromptLine = lines.find(
      (l) => /^\s+prompt:/.test(l) && !l.trimStart().startsWith('#'),
    )
    expect(activePromptLine).toBeUndefined()
  })

  it('does NOT trigger on push events', () => {
    const lines = content.split('\n')
    const onBlock: string[] = []
    let inOnBlock = false
    for (const line of lines) {
      if (/^on:/.test(line)) {
        inOnBlock = true
        continue
      }
      if (inOnBlock && /^\S/.test(line) && !/^\s/.test(line)) break
      if (inOnBlock) onBlock.push(line)
    }
    const onSection = onBlock.join('\n')
    expect(onSection).not.toContain('push:')
  })

  it('file is not empty', () => {
    expect(content.trim().length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Cross-workflow consistency checks
// ---------------------------------------------------------------------------

describe('workflow consistency', () => {
  let reviewContent: string
  let claudeContent: string

  beforeAll(() => {
    reviewContent = readWorkflow('claude-code-review.yml')
    claudeContent = readWorkflow('claude.yml')
  })

  it('both workflows use the same pinned actions/checkout SHA', () => {
    const checkoutSha = '34e114876b0b11c390a56381ad16ebd13914f8d5'
    expect(reviewContent).toContain(checkoutSha)
    expect(claudeContent).toContain(checkoutSha)
  })

  it('both workflows use the same pinned anthropics/claude-code-action SHA', () => {
    const actionSha = '99ca333651aa9a8becc279065fad21c4ef1c4494'
    expect(reviewContent).toContain(actionSha)
    expect(claudeContent).toContain(actionSha)
  })

  it('both workflows use the same secret name for the OAuth token', () => {
    const secretRef = 'secrets.CLAUDE_CODE_OAUTH_TOKEN'
    expect(reviewContent).toContain(secretRef)
    expect(claudeContent).toContain(secretRef)
  })

  it('both workflows run on ubuntu-latest', () => {
    expect(reviewContent).toContain('runs-on: ubuntu-latest')
    expect(claudeContent).toContain('runs-on: ubuntu-latest')
  })

  it('both workflows share core permissions: contents, pull-requests, issues, id-token', () => {
    const corePermissions = [
      'contents: write',
      'pull-requests: write',
      'issues: write',
      'id-token: write',
    ]
    for (const perm of corePermissions) {
      expect(reviewContent).toContain(perm)
      expect(claudeContent).toContain(perm)
    }
  })

  it('both workflows use fetch-depth: 1 for shallow clones', () => {
    expect(reviewContent).toContain('fetch-depth: 1')
    expect(claudeContent).toContain('fetch-depth: 1')
  })

  it('claude.yml has additional actions: read permission that claude-code-review.yml lacks', () => {
    expect(claudeContent).toContain('actions: read')
    // claude-code-review.yml should NOT have actions: read in its permissions block
    // (it's only present in claude.yml for CI result reading)
    const reviewPermBlock = reviewContent.match(/permissions:([\s\S]*?)steps:/)?.[1] ?? ''
    expect(reviewPermBlock).not.toContain('actions: read')
  })

  it('claude-code-review.yml triggers on pull_request while claude.yml does not', () => {
    // Extract top-level on: section from each file
    const reviewOnSection = reviewContent.match(/^on:([\s\S]*?)^jobs:/m)?.[1] ?? ''
    const claudeOnSection = claudeContent.match(/^on:([\s\S]*?)^jobs:/m)?.[1] ?? ''

    expect(reviewOnSection).toContain('pull_request:')
    expect(claudeOnSection).not.toContain('pull_request:')
  })

  it('claude.yml triggers on issue_comment while claude-code-review.yml does not', () => {
    const reviewOnSection = reviewContent.match(/^on:([\s\S]*?)^jobs:/m)?.[1] ?? ''
    const claudeOnSection = claudeContent.match(/^on:([\s\S]*?)^jobs:/m)?.[1] ?? ''

    expect(claudeOnSection).toContain('issue_comment:')
    expect(reviewOnSection).not.toContain('issue_comment:')
  })
})
