/**
 * CodeSyne - Collaborative Cloud IDE & Multi-Language Studio
 * Created by Nakul Sharma (@nakulsh02)
 *
 * Official Website: https://codesyne.vercel.app
 * Public Repository: https://github.com/nakulsh02/CodeSyne
 */

export interface CodeSyneWorkspace {
  id: string;
  name: string;
  author: string;
  languages: ('javascript' | 'typescript' | 'python' | 'cpp' | 'java' | 'rust' | 'go' | 'sql' | 'html')[];
  isCollaborative: boolean;
  activeCollaborators: number;
}

export const createCodeSyneSession = (workspaceName: string, author = 'nakulsh02'): CodeSyneWorkspace => {
  return {
    id: `codesyne_${Date.now()}`,
    name: workspaceName,
    author,
    languages: ['javascript', 'typescript', 'python', 'cpp', 'java', 'rust', 'go', 'sql', 'html'],
    isCollaborative: true,
    activeCollaborators: 1
  };
};

export default createCodeSyneSession;
