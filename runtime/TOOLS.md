# Available Tools

## n8n-as-code Tools

### n8n_execute
Use this to create or execute an n8n workflow via n8n-as-code service.
- Method: POST http://avry-n8n-as-code:3500/execute
- Timeout: 60 seconds
- When: User requests workflow generation or automation
- Parameters (JSON body):
  - action: "create_workflow" or other supported actions
  - workflow: { name, nodes, connections }

### n8n_list
Use this to list existing n8n workflows from n8n-as-code service.
- Method: GET http://avry-n8n-as-code:3500/workflows
- Timeout: 10 seconds
- When: User asks what workflows exist or needs to see available workflows
- Returns: Array of workflow objects
