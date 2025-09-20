/**
 * Workflow Execution Engine
 * 
 * This module provides a comprehensive workflow execution engine that supports:
 * - DAG-based workflow execution with topological ordering
 * - Step execution with retry logic and error handling
 * - Context accumulation between steps
 * - Persistent workflow and step state management
 * - In-memory execution queue with restart safety
 */

import { nanoid } from "nanoid";
import { storage, type IStorage } from "../storage";
import { logger } from "../logger";
import { stepRegistry, type StepContext, type StepResult, type WorkflowStepConfig } from "./steps";
import type { WorkflowVersion, WorkflowRun, WorkflowRunStep, InsertWorkflowRun, InsertWorkflowRunStep } from "@shared/schema";

// =================== CORE INTERFACES ===================

/**
 * Workflow definition JSON structure
 */
export interface WorkflowDefinition {
  /** Array of step definitions */
  steps: WorkflowStepConfig[];
  /** Array of edges defining step transitions */
  edges: WorkflowEdge[];
  /** Entry point step key */
  entry: string;
  /** Optional workflow metadata */
  metadata?: {
    name?: string;
    description?: string;
    version?: string;
  };
}

/**
 * Edge definition for workflow DAG
 */
export interface WorkflowEdge {
  /** Source step key */
  from: string;
  /** Target step key */
  to: string;
  /** Optional condition for edge traversal (simple expressions like "status === 'success'") */
  when?: string;
}

/**
 * Execution context for workflow runs
 */
export interface WorkflowExecutionContext {
  /** Workflow run ID */
  runId: string;
  /** Optional scan result ID */
  scanId?: string;
  /** Optional lead ID */
  leadId?: string;
  /** Business type for the workflow */
  businessType?: string;
  /** Accumulated context data that persists across steps */
  data: Record<string, any>;
  /** Execution metadata */
  metadata: {
    /** Workflow start time */
    startTime: Date;
    /** Currently executing step */
    currentStep?: string;
    /** Execution attempt number */
    attempt: number;
  };
}

/**
 * Step execution result with extended metadata
 */
interface StepExecutionResult {
  /** Whether the step succeeded */
  success: boolean;
  /** Step output data */
  outputs?: Record<string, any>;
  /** Context updates to merge */
  updates?: Record<string, any>;
  /** Error message if step failed */
  error?: string;
  /** Whether the error is retryable */
  retryable?: boolean;
}

/**
 * Workflow execution queue item
 */
interface WorkflowQueueItem {
  /** Unique queue item ID */
  id: string;
  /** Business type for workflow selection */
  businessType?: string;
  /** Execution context */
  context: Omit<WorkflowExecutionContext, 'runId'>;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Creation timestamp */
  createdAt: Date;
  /** Number of execution attempts */
  attempts: number;
  /** Maximum attempts before giving up */
  maxAttempts: number;
}

// =================== ERROR CLASSES ===================

export class WorkflowExecutionError extends Error {
  constructor(
    message: string,
    public readonly runId?: string,
    public readonly stepKey?: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'WorkflowExecutionError';
  }
}

export class StepExecutionError extends Error {
  constructor(
    message: string,
    public readonly stepKey: string,
    public readonly attempt: number,
    public readonly retryable: boolean = true
  ) {
    super(message);
    this.name = 'StepExecutionError';
  }
}

export class WorkflowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowValidationError';
  }
}

// =================== MAIN EXECUTOR CLASS ===================

export class WorkflowExecutor {
  private readonly storage: IStorage;
  private readonly executionQueue: Map<string, WorkflowQueueItem> = new Map();
  private readonly runningExecutions: Set<string> = new Set();
  private isProcessing: boolean = false;

  constructor(storageInstance: IStorage = storage) {
    this.storage = storageInstance;
    
    // Start processing queue every 5 seconds
    setInterval(() => this.processQueue(), 5000);
  }

  // =================== PUBLIC API ===================

  /**
   * Main entry point: Execute a workflow for a given business type
   */
  async executeWorkflow(
    businessType: string | undefined,
    context: Partial<WorkflowExecutionContext>
  ): Promise<string> {
    const queueId = nanoid();
    
    // Create queue item
    const queueItem: WorkflowQueueItem = {
      id: queueId,
      businessType,
      context: {
        scanId: context.scanId,
        leadId: context.leadId,
        businessType,
        data: context.data || {},
        metadata: {
          startTime: new Date(),
          attempt: 1,
          ...context.metadata
        }
      },
      priority: context.metadata?.attempt || 1,
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: 3
    };

    this.executionQueue.set(queueId, queueItem);
    
    logger.info('Workflow execution queued', {
      queueId,
      businessType,
      scanId: context.scanId,
      leadId: context.leadId
    });

    // Trigger immediate processing if not already running
    if (!this.isProcessing) {
      setImmediate(() => this.processQueue());
    }

    return queueId;
  }

  /**
   * Get execution status for a queued workflow
   */
  getQueueStatus(queueId: string): WorkflowQueueItem | undefined {
    return this.executionQueue.get(queueId);
  }

  /**
   * Cancel a queued workflow execution
   */
  cancelExecution(queueId: string): boolean {
    if (this.runningExecutions.has(queueId)) {
      logger.warn('Cannot cancel running execution', { queueId });
      return false;
    }
    
    const removed = this.executionQueue.delete(queueId);
    if (removed) {
      logger.info('Workflow execution cancelled', { queueId });
    }
    
    return removed;
  }

  // =================== PRIVATE QUEUE PROCESSING ===================

  /**
   * Process the execution queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.executionQueue.size === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // Get highest priority item (lowest priority number)
      const sortedItems = Array.from(this.executionQueue.values())
        .sort((a, b) => a.priority - b.priority);

      for (const queueItem of sortedItems) {
        if (this.runningExecutions.has(queueItem.id)) {
          continue; // Skip if already running
        }

        // Check if max attempts reached
        if (queueItem.attempts >= queueItem.maxAttempts) {
          this.executionQueue.delete(queueItem.id);
          logger.error('Workflow execution failed after max attempts', undefined, {
            queueId: queueItem.id,
            attempts: queueItem.attempts
          });
          continue;
        }

        // Execute this workflow
        await this.executeWorkflowRun(queueItem);
      }
    } catch (error) {
      logger.error('Error processing workflow queue', error instanceof Error ? error : undefined, 
        { error: error instanceof Error ? error.message : String(error) });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute a single workflow run
   */
  private async executeWorkflowRun(queueItem: WorkflowQueueItem): Promise<void> {
    const startTime = Date.now();
    this.runningExecutions.add(queueItem.id);
    
    let workflowRun: WorkflowRun | undefined;
    
    try {
      // Increment attempt count
      queueItem.attempts++;
      queueItem.context.metadata.attempt = queueItem.attempts;

      logger.info('Starting workflow execution', {
        queueId: queueItem.id,
        businessType: queueItem.businessType,
        attempt: queueItem.attempts
      });

      // 1. Fetch workflow definition
      const workflowVersion = await this.getWorkflowVersion(queueItem.businessType);
      if (!workflowVersion) {
        throw new WorkflowExecutionError(
          `No published workflow found for business type: ${queueItem.businessType}`,
          undefined,
          undefined,
          false
        );
      }

      // 2. Validate workflow definition
      const definition = this.validateWorkflowDefinition(workflowVersion.definition as WorkflowDefinition);

      // 3. Create workflow run record
      workflowRun = await this.createWorkflowRun(workflowVersion.id, queueItem.context);
      
      // Update context with run ID
      const context: WorkflowExecutionContext = {
        ...queueItem.context,
        runId: workflowRun.id
      };

      logger.info('Created workflow run', { 
        runId: workflowRun.id,
        workflowVersionId: workflowVersion.id
      });

      // 4. Execute DAG
      const success = await this.executeDag(definition, context);
      
      // 5. Update final run status
      await this.updateRunStatus(workflowRun.id, success ? 'succeeded' : 'failed', context);

      // 6. Update scan results if applicable
      if (context.scanId && success) {
        await this.updateScanResultsWithOutputs(context.scanId, context.data);
      }

      // Remove from queue on success
      this.executionQueue.delete(queueItem.id);

      const duration = Date.now() - startTime;
      logger.info('Workflow execution completed', {
        queueId: queueItem.id,
        runId: workflowRun.id,
        success,
        duration: `${duration}ms`
      });

    } catch (error) {
      const isRetryable = error instanceof WorkflowExecutionError ? error.retryable : true;
      
      logger.error('Workflow execution failed', error instanceof Error ? error : undefined, {
        queueId: queueItem.id,
        runId: workflowRun?.id,
        attempt: queueItem.attempts,
        error: error instanceof Error ? error.message : String(error),
        retryable: isRetryable
      });

      // Update run status if we have a run ID
      if (workflowRun) {
        const fullContext: WorkflowExecutionContext = {
          ...queueItem.context,
          runId: workflowRun.id
        };
        await this.updateRunStatus(workflowRun.id, 'failed', fullContext, error instanceof Error ? error.message : String(error));
      }

      // Schedule retry if retryable and within attempt limit
      if (isRetryable && queueItem.attempts < queueItem.maxAttempts) {
        // Exponential backoff: 2^attempt * 1000ms
        const backoffMs = Math.pow(2, queueItem.attempts) * 1000;
        
        setTimeout(() => {
          if (this.executionQueue.has(queueItem.id)) {
            logger.info('Retrying workflow execution', {
              queueId: queueItem.id,
              attempt: queueItem.attempts + 1,
              backoffMs
            });
          }
        }, backoffMs);
      } else {
        // Remove from queue if not retryable or max attempts reached
        this.executionQueue.delete(queueItem.id);
      }
    } finally {
      this.runningExecutions.delete(queueItem.id);
    }
  }

  // =================== WORKFLOW MANAGEMENT ===================

  /**
   * Get published workflow version by business type or default
   */
  private async getWorkflowVersion(businessType?: string): Promise<WorkflowVersion | undefined> {
    if (businessType) {
      const specific = await this.storage.getPublishedWorkflowByBusinessType(businessType);
      if (specific) return specific;
    }
    
    // Fallback to default workflow
    return await this.storage.getDefaultPublishedWorkflow();
  }

  /**
   * Validate workflow definition structure
   */
  private validateWorkflowDefinition(definition: any): WorkflowDefinition {
    if (!definition || typeof definition !== 'object') {
      throw new WorkflowValidationError('Workflow definition must be an object');
    }

    if (!Array.isArray(definition.steps)) {
      throw new WorkflowValidationError('Workflow definition must have a steps array');
    }

    if (!Array.isArray(definition.edges)) {
      throw new WorkflowValidationError('Workflow definition must have an edges array');
    }

    if (!definition.entry || typeof definition.entry !== 'string') {
      throw new WorkflowValidationError('Workflow definition must have an entry step key');
    }

    // Validate steps
    const stepKeys = new Set<string>();
    for (const step of definition.steps) {
      if (!step.key || !step.type) {
        throw new WorkflowValidationError('Each step must have key and type');
      }
      if (stepKeys.has(step.key)) {
        throw new WorkflowValidationError(`Duplicate step key: ${step.key}`);
      }
      stepKeys.add(step.key);

      // Check if step type is registered
      if (!stepRegistry[step.type]) {
        throw new WorkflowValidationError(`Unknown step type: ${step.type}`);
      }
    }

    // Validate entry step exists
    if (!stepKeys.has(definition.entry)) {
      throw new WorkflowValidationError(`Entry step not found: ${definition.entry}`);
    }

    // Validate edges reference valid steps
    for (const edge of definition.edges) {
      if (!edge.from || !edge.to) {
        throw new WorkflowValidationError('Each edge must have from and to step keys');
      }
      if (!stepKeys.has(edge.from)) {
        throw new WorkflowValidationError(`Edge references unknown step: ${edge.from}`);
      }
      if (!stepKeys.has(edge.to)) {
        throw new WorkflowValidationError(`Edge references unknown step: ${edge.to}`);
      }
    }

    return definition as WorkflowDefinition;
  }

  /**
   * Create workflow run record
   */
  private async createWorkflowRun(
    workflowVersionId: string,
    context: Omit<WorkflowExecutionContext, 'runId'>
  ): Promise<WorkflowRun> {
    const runData: InsertWorkflowRun = {
      workflowVersionId,
      scanId: context.scanId,
      leadId: context.leadId,
      status: 'queued',
      context: context.data,
      startedAt: new Date()
    };

    const run = await this.storage.createWorkflowRun(runData);
    
    // Update to running status
    await this.storage.updateWorkflowRun(run.id, { 
      status: 'running', 
      startedAt: new Date() 
    });

    return { ...run, status: 'running', startedAt: new Date() };
  }

  // =================== DAG EXECUTION ===================

  /**
   * Execute workflow DAG with topological ordering
   */
  private async executeDag(
    definition: WorkflowDefinition,
    context: WorkflowExecutionContext
  ): Promise<boolean> {
    const stepsMap = new Map(definition.steps.map(step => [step.key, step]));
    const edgesMap = this.buildEdgesMap(definition.edges);
    
    // Topological sort to determine execution order
    const executionOrder = this.topologicalSort(definition.steps, definition.edges, definition.entry);
    
    logger.info('Executing workflow DAG', {
      runId: context.runId,
      totalSteps: executionOrder.length,
      entryStep: definition.entry
    });

    let currentSteps = new Set([definition.entry]);
    const completedSteps = new Set<string>();
    const failedSteps = new Set<string>();

    while (currentSteps.size > 0) {
      const stepPromises: Promise<{ stepKey: string; success: boolean }>[] = [];

      // Execute all current steps in parallel
      for (const stepKey of Array.from(currentSteps)) {
        const step = stepsMap.get(stepKey);
        if (!step) {
          logger.error('Step not found in definition', undefined, { runId: context.runId, stepKey });
          continue;
        }

        stepPromises.push(
          this.executeStep(step, context)
            .then(result => ({ stepKey, success: result.success }))
            .catch(error => {
              logger.error('Step execution failed', error instanceof Error ? error : undefined, {
                runId: context.runId,
                stepKey,
                error: error instanceof Error ? error.message : String(error)
              });
              return { stepKey, success: false };
            })
        );
      }

      // Wait for all current steps to complete
      const results = await Promise.all(stepPromises);
      
      currentSteps.clear();

      // Process results and determine next steps
      for (const { stepKey, success } of results) {
        if (success) {
          completedSteps.add(stepKey);
          
          // Find next steps based on edges and conditions
          const nextSteps = await this.computeNextSteps(stepKey, edgesMap, context);
          
          for (const nextStep of nextSteps) {
            if (!completedSteps.has(nextStep) && !failedSteps.has(nextStep)) {
              currentSteps.add(nextStep);
            }
          }
        } else {
          failedSteps.add(stepKey);
        }
      }

      // If any critical step failed, stop execution
      if (failedSteps.size > 0) {
        logger.warn('Workflow execution stopped due to failed steps', {
          runId: context.runId,
          failedSteps: Array.from(failedSteps)
        });
        break;
      }
    }

    const success = failedSteps.size === 0;
    
    logger.info('DAG execution completed', {
      runId: context.runId,
      success,
      completedSteps: completedSteps.size,
      failedSteps: failedSteps.size
    });

    return success;
  }

  /**
   * Build adjacency map for edges
   */
  private buildEdgesMap(edges: WorkflowEdge[]): Map<string, WorkflowEdge[]> {
    const edgesMap = new Map<string, WorkflowEdge[]>();
    
    for (const edge of edges) {
      if (!edgesMap.has(edge.from)) {
        edgesMap.set(edge.from, []);
      }
      edgesMap.get(edge.from)!.push(edge);
    }
    
    return edgesMap;
  }

  /**
   * Topological sort for DAG execution order
   */
  private topologicalSort(
    steps: WorkflowStepConfig[], 
    edges: WorkflowEdge[], 
    entry: string
  ): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
    const stepKeys = new Set(steps.map(s => s.key));

    const visit = (stepKey: string) => {
      if (visited.has(stepKey)) return;
      
      visited.add(stepKey);
      
      // Visit dependencies first (reverse topological order)
      for (const edge of edges) {
        if (edge.to === stepKey && stepKeys.has(edge.from)) {
          visit(edge.from);
        }
      }
      
      result.push(stepKey);
    };

    // Start with entry step
    visit(entry);
    
    // Visit any remaining unvisited steps
    for (const step of steps) {
      visit(step.key);
    }

    return result;
  }

  /**
   * Compute next steps based on edges and conditions
   */
  private async computeNextSteps(
    currentStep: string,
    edgesMap: Map<string, WorkflowEdge[]>,
    context: WorkflowExecutionContext
  ): Promise<string[]> {
    const edges = edgesMap.get(currentStep) || [];
    const nextSteps: string[] = [];

    for (const edge of edges) {
      let shouldTraverse = true;

      // Evaluate condition if present
      if (edge.when) {
        shouldTraverse = await this.evaluateCondition(edge.when, context);
      }

      if (shouldTraverse) {
        nextSteps.push(edge.to);
      }
    }

    return nextSteps;
  }

  /**
   * Evaluate simple condition expressions
   */
  private async evaluateCondition(
    condition: string,
    context: WorkflowExecutionContext
  ): Promise<boolean> {
    try {
      // Simple expression evaluation for conditions like:
      // "status === 'success'"
      // "data.score > 0.8"
      // "outputs.hasError === false"
      
      // Create safe evaluation context
      const evalContext = {
        data: context.data,
        metadata: context.metadata
      };

      // Basic condition parsing and evaluation
      // This is a simplified implementation - in production you might want to use
      // a proper expression parser like jsep or similar
      
      // Replace variable references
      let expr = condition.replace(/\bdata\./g, 'evalContext.data.');
      expr = expr.replace(/\bmetadata\./g, 'evalContext.metadata.');

      // Safe evaluation (in production, consider using a sandboxed evaluator)
      const result = Function('evalContext', `return ${expr}`)(evalContext);
      
      return Boolean(result);
    } catch (error) {
      logger.warn('Condition evaluation failed, defaulting to false', {
        runId: context.runId,
        condition,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  // =================== STEP EXECUTION ===================

  /**
   * Execute a single workflow step with retry logic
   */
  private async executeStep(
    step: WorkflowStepConfig,
    context: WorkflowExecutionContext
  ): Promise<StepExecutionResult> {
    const maxAttempts = 3;
    let attempt = 1;
    let lastError: Error | undefined;

    while (attempt <= maxAttempts) {
      const stepExecutionId = nanoid();
      
      try {
        logger.info('Executing step', {
          runId: context.runId,
          stepKey: step.key,
          stepType: step.type,
          attempt,
          stepExecutionId
        });

        // Create step execution record
        const stepRecord = await this.createStepExecution(
          context.runId,
          step,
          attempt,
          context.data
        );

        // Get step definition from registry
        const stepDefinition = stepRegistry[step.type];
        if (!stepDefinition) {
          throw new StepExecutionError(
            `Step type not found in registry: ${step.type}`,
            step.key,
            attempt,
            false
          );
        }

        // Validate step configuration
        try {
          stepDefinition.configSchema.parse(step.config);
        } catch (validationError) {
          throw new StepExecutionError(
            `Step configuration validation failed: ${validationError}`,
            step.key,
            attempt,
            false
          );
        }

        // Create step context
        const stepContext: StepContext = {
          runId: context.runId,
          scanId: context.scanId,
          leadId: context.leadId,
          data: { ...context.data },
          storage: this.storage,
          logger: logger
        };

        // Execute the step
        const startTime = Date.now();
        const stepResult = await stepDefinition.run(stepContext, step.config);
        const duration = Date.now() - startTime;

        // Update step record with success
        await this.storage.updateWorkflowRunStep(stepRecord.id, {
          status: 'succeeded',
          output: stepResult.outputs || null,
          finishedAt: new Date()
        });

        // Merge step outputs into context
        if (stepResult.updates) {
          Object.assign(context.data, stepResult.updates);
        }

        if (stepResult.outputs) {
          // Store step outputs in context with step key namespace
          context.data[`${step.key}_outputs`] = stepResult.outputs;
        }

        logger.info('Step execution succeeded', {
          runId: context.runId,
          stepKey: step.key,
          attempt,
          duration: `${duration}ms`,
          stepExecutionId
        });

        return {
          success: true,
          outputs: stepResult.outputs,
          updates: stepResult.updates
        };

      } catch (error) {
        const isRetryable = !(error instanceof StepExecutionError) || error.retryable;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        logger.error('Step execution failed', error instanceof Error ? error : undefined, {
          runId: context.runId,
          stepKey: step.key,
          attempt,
          error: errorMessage,
          retryable: isRetryable,
          stepExecutionId
        });

        // Update step record with failure
        const stepRecord = await this.storage.getWorkflowRunSteps(context.runId);
        const currentStepRecord = stepRecord.find(s => s.stepKey === step.key && s.attempt === attempt);
        if (currentStepRecord) {
          await this.storage.updateWorkflowRunStep(currentStepRecord.id, {
            status: 'failed',
            error: errorMessage,
            finishedAt: new Date()
          });
        }

        lastError = error instanceof Error ? error : new Error(errorMessage);
        
        // If not retryable or max attempts reached, fail immediately
        if (!isRetryable || attempt >= maxAttempts) {
          return {
            success: false,
            error: errorMessage,
            retryable: isRetryable
          };
        }

        // Exponential backoff for retry
        const backoffMs = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        
        attempt++;
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Step execution failed after max attempts',
      retryable: false
    };
  }

  /**
   * Create step execution record
   */
  private async createStepExecution(
    runId: string,
    step: WorkflowStepConfig,
    attempt: number,
    input: Record<string, any>
  ): Promise<WorkflowRunStep> {
    const stepData: InsertWorkflowRunStep = {
      runId,
      stepKey: step.key,
      type: step.type,
      status: 'running',
      input: input,
      attempt,
      startedAt: new Date()
    };

    return await this.storage.createWorkflowRunStep(stepData);
  }

  // =================== STATUS MANAGEMENT ===================

  /**
   * Update final workflow run status
   */
  private async updateRunStatus(
    runId: string,
    status: 'succeeded' | 'failed',
    context: WorkflowExecutionContext,
    error?: string
  ): Promise<void> {
    const updates: Partial<WorkflowRun> = {
      status,
      finishedAt: new Date(),
      context: context.data
    };

    await this.storage.updateWorkflowRun(runId, updates);
    
    logger.info('Updated workflow run status', {
      runId,
      status,
      error: error || undefined
    });
  }

  /**
   * Update scan results with workflow outputs
   */
  private async updateScanResultsWithOutputs(
    scanId: string,
    outputs: Record<string, any>
  ): Promise<void> {
    try {
      const scanResult = await this.storage.getScanResult(scanId);
      if (!scanResult) {
        logger.warn('Scan result not found for outputs update', { scanId });
        return;
      }

      // Merge workflow outputs into scan data
      let scanData = {};
      if (scanResult.scanData) {
        try {
          scanData = JSON.parse(scanResult.scanData);
        } catch (parseError) {
          logger.warn('Failed to parse existing scan data', { scanId });
        }
      }

      const updatedScanData = {
        ...scanData,
        workflowOutputs: outputs,
        lastUpdated: new Date().toISOString()
      };

      await this.storage.updateScanResult(scanId, {
        scanData: JSON.stringify(updatedScanData),
        status: 'completed'
      });

      logger.info('Updated scan results with workflow outputs', { scanId });
    } catch (error) {
      logger.error('Failed to update scan results', error instanceof Error ? error : undefined, {
        scanId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

// =================== SINGLETON INSTANCE ===================

export const workflowExecutor = new WorkflowExecutor();

// =================== PUBLIC API ===================

/**
 * Execute a workflow for the given business type and context
 * 
 * @param businessType Business type to select appropriate workflow
 * @param context Execution context including scanId, leadId, and data
 * @returns Promise resolving to queue ID for tracking execution
 */
export async function executeWorkflow(
  businessType: string | undefined,
  context: Partial<WorkflowExecutionContext>
): Promise<string> {
  return workflowExecutor.executeWorkflow(businessType, context);
}

/**
 * Get the status of a queued workflow execution
 * 
 * @param queueId Queue ID returned from executeWorkflow
 * @returns Queue item status or undefined if not found
 */
export function getExecutionStatus(queueId: string): WorkflowQueueItem | undefined {
  return workflowExecutor.getQueueStatus(queueId);
}

/**
 * Cancel a queued workflow execution
 * 
 * @param queueId Queue ID to cancel
 * @returns True if successfully cancelled, false otherwise
 */
export function cancelExecution(queueId: string): boolean {
  return workflowExecutor.cancelExecution(queueId);
}