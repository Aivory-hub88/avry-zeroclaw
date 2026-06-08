# n8n Skill

Aivory n8n Workflow Copilot skill for ZeroClaw.

## What it does
- Generates n8n workflow specs from natural language
- Suggests repairs for broken workflows
- Optimizes existing workflows (fewer nodes, better branching)
- Explains setup reports in business language

## Architecture
Agent → ZeroClaw (spec/reasoning) → VPS Bridge → n8n-as-code-service → n8n

## Routing
| Hint | Model | Use case |
|------|-------|----------|
| workflow_copilot | DeepSeek V4 Pro | Standard tasks |
| workflow_copilot_premium | Claude Sonnet 4.6 | Heavy/complex |
| workflow_copilot_technical | Qwen3 Coder+ | Code-heavy |
| workflow_copilot_reasoning | DeepSeek Thinking | Logic-heavy |
| workflow_copilot_fast | Qwen Turbo | Quick drafts |

## Constraints
- Never runs npx n8nac directly
- Never calls n8n APIs directly
- Never exposes internal ports, paths, or credentials
