# Intelligence kernel

`src/intelligence.js` adds a controlled continuous-improvement loop:

- proposals are generated from objectives and evidence;
- proposals are stored and scored in D1;
- approved work is queued as tasks;
- the model evaluates tasks and test plans;
- every action is audited;
- production deploy, secret access, destructive SQL, and arbitrary shell execution remain outside the model.

This is an engineering improvement loop, not autonomous self-training or consciousness. A language model does not rewrite its own weights. New capabilities come from better prompts, retrieval data, tests, tools, and reviewed code changes.

## Integration

Import the module in `src/index.js`:

```js
import {
  initializeIntelligence,
  proposeImprovement,
  scoreProposal,
  queueApprovedTask,
  runImprovementCycle
} from "./intelligence.js";
```

Call `initializeIntelligence(env.DB)` after the existing database initialization. Add protected operator endpoints for proposal creation, scoring, approval, and cycle execution. Do not expose approval or deployment endpoints to unauthenticated clients.

The deployment pipeline should run syntax checks and tests, then require a human-approved pull request before production deployment.
