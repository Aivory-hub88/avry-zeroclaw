const TOOLS_MATRIX = {
  workflow: ['n8n_list_workflows', 'n8n_get_workflow', 'n8n_create_workflow'],
  workflow_edit: ['n8n_get_workflow', 'n8n_update_workflow', 'n8n_activate_workflow', 'n8n_execute_workflow', 'n8n_list_executions'],
  activation_agent: ['n8n_activate_workflow', 'n8n_execute_workflow'],
  console: ['search_knowledge_base', 'get_user_context'],
  dev: ['inspect_logs', 'run_diagnostic', 'n8n_list_executions'],
  default: ['search_knowledge_base', 'get_user_context']
};

function getToolsForUseCase(useCase) {
  const toolNames = TOOLS_MATRIX[useCase] || TOOLS_MATRIX['default'];
  console.log('[tool-filter] useCase="' + useCase + '" -> ' + toolNames.length + ' tools: ' + toolNames.join(', '));
  return toolNames;
}

module.exports = { getToolsForUseCase };
