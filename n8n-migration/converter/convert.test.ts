import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { convertWorkflow, N8N_TO_AGENTFLOW_TYPE_MAP } from './convert.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function runTests() {
  console.log('🧪 Starting n8n Workflow Converter Unit Tests...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // Test 1: Inventory node mapping completeness
  console.log('Test Suite 1: Node Taxonomy Mapping');
  const requiredInventoryNodes = [
    'n8n-nodes-base.gmailTrigger',
    'n8n-nodes-base.gmail',
    'n8n-nodes-base.googleDrive',
    'n8n-nodes-base.emailReadImap',
    'n8n-nodes-base.code',
    'n8n-nodes-base.evaluationTrigger',
  ];

  for (const nodeType of requiredInventoryNodes) {
    const mapping = N8N_TO_AGENTFLOW_TYPE_MAP[nodeType];
    assert(!!mapping, `Mapping exists for ${nodeType} → ${mapping?.type}`);
  }

  // Test 2: Convert Save_Gmail_Attachments_to_Google_Drive.json
  console.log('\nTest Suite 2: Save_Gmail_Attachments_to_Google_Drive.json');
  const file1 = join(__dirname, '../workflows/Save_Gmail_Attachments_to_Google_Drive.json');
  assert(existsSync(file1), `Workflow file 1 exists: ${file1}`);
  const raw1 = JSON.parse(readFileSync(file1, 'utf-8'));
  const res1 = convertWorkflow(raw1);
  assert(res1.errors.length === 0, 'No errors in conversion');
  assert(res1.workflow.name === 'Save Gmail Attachments to Google Drive', 'Preserves workflow name');
  assert(res1.nodes.length === 3, 'Converts exactly 3 nodes');
  assert(res1.edges.length === 2, 'Converts exactly 2 edges');
  assert(res1.triggers.length === 1, 'Extracts 1 trigger');
  assert(res1.triggers[0].type === 'gmail', 'Trigger type is mapped to gmail');

  const nodeTypes1 = res1.nodes.map(n => n.type);
  assert(nodeTypes1.includes('gmailTrigger'), 'Contains gmailTrigger node');
  assert(nodeTypes1.includes('code'), 'Contains code node');
  assert(nodeTypes1.includes('googleDrive'), 'Contains googleDrive node');

  // Validate edge connections
  const gmailNode = res1.nodes.find(n => n.type === 'gmailTrigger')!;
  const codeNode = res1.nodes.find(n => n.type === 'code')!;
  const gdriveNode = res1.nodes.find(n => n.type === 'googleDrive')!;
  const edge1 = res1.edges.find(e => e.sourceNodeId === gmailNode.id && e.targetNodeId === codeNode.id);
  const edge2 = res1.edges.find(e => e.sourceNodeId === codeNode.id && e.targetNodeId === gdriveNode.id);
  assert(!!edge1, 'Valid edge from gmailTrigger to code');
  assert(!!edge2, 'Valid edge from code to googleDrive');

  // Test 3: Convert My_workflow.json
  console.log('\nTest Suite 3: My_workflow.json');
  const file2 = join(__dirname, '../workflows/My_workflow.json');
  assert(existsSync(file2), `Workflow file 2 exists: ${file2}`);
  const raw2 = JSON.parse(readFileSync(file2, 'utf-8'));
  const res2 = convertWorkflow(raw2);
  assert(res2.errors.length === 0, 'No errors in conversion');
  assert(res2.workflow.name === 'My workflow', 'Preserves workflow name');
  assert(res2.nodes.length === 1, 'Converts exactly 1 node');
  assert(res2.nodes[0].type === 'evaluationTrigger', 'Node type is evaluationTrigger');
  assert(res2.triggers.length === 1, 'Extracts 1 trigger');
  assert(res2.triggers[0].type === 'evaluation', 'Trigger type is evaluation');

  // Test 4: Convert My_workflow_2.json
  console.log('\nTest Suite 4: My_workflow_2.json');
  const file3 = join(__dirname, '../workflows/My_workflow_2.json');
  assert(existsSync(file3), `Workflow file 3 exists: ${file3}`);
  const raw3 = JSON.parse(readFileSync(file3, 'utf-8'));
  const res3 = convertWorkflow(raw3);
  assert(res3.errors.length === 0, 'No errors in conversion');
  assert(res3.workflow.name === 'My workflow 2', 'Preserves workflow name');
  assert(res3.nodes.length === 2, 'Converts exactly 2 nodes');
  assert(res3.edges.length === 1, 'Converts exactly 1 edge');
  assert(res3.triggers.length === 1, 'Extracts 1 trigger');
  assert(res3.triggers[0].type === 'imap', 'Trigger type is imap');

  const imapNode = res3.nodes.find(n => n.type === 'emailReadImap')!;
  const gmailActionNode = res3.nodes.find(n => n.type === 'gmail')!;
  assert(!!imapNode, 'Contains emailReadImap node');
  assert(!!gmailActionNode, 'Contains gmail action node');
  const edge3 = res3.edges.find(e => e.sourceNodeId === imapNode.id && e.targetNodeId === gmailActionNode.id);
  assert(!!edge3, 'Valid edge from emailReadImap to gmail');

  console.log(`\n========================================`);
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
