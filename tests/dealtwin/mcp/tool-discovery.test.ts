import {describe,expect,it} from 'vitest';
import {listToolDefinitions,toolNames} from '../../../lib/dealtwin/mcp/tool-schemas';

describe('agent-facing discovery reflects actual service boundaries',()=>{
 it('distinguishes every operation and discloses the external extraction boundary',()=>{
  const tools=listToolDefinitions();
  expect(tools.map(tool=>tool.name)).toEqual(toolNames);
  expect(new Set(tools.map(tool=>tool.description)).size).toBe(toolNames.length);
  const extraction=tools.find(tool=>tool.name==='extract_constraints')!;
  expect(extraction.annotations.openWorldHint).toBe(true);
  expect(extraction.description).toMatch(/Nebius/);
  expect(extraction.description).toMatch(/pending/);
  expect(extraction.description).toMatch(/confirmation/);
  expect(tools.filter(tool=>tool.annotations.openWorldHint).map(tool=>tool.name)).toEqual(['extract_constraints']);
  expect(tools.find(tool=>tool.name==='commit_deal')!.description).toMatch(/approval/);
  expect(tools.find(tool=>tool.name==='replay_proof')!.description).toMatch(/historical/);
 });
});
