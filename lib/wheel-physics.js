/**
 * Physics engine for wheel input with velocity, friction, and momentum
 */
export class WheelPhysics {
  constructor(name, options = {}) {
    this.name = name;
    this.position = 0;
    this.velocity = 0;
    this.lastInputTime = 0;
    this.isAnimating = false;
    this.animationInterval = null;
    
    // Physics constants
    this.velocityThreshold = 0.1;
    this.targetMultiplier = 2.5;
    this.friction = options.friction || 50; // 5-100, where 50 is baseline
    this.sensitivity = options.sensitivity || 50; // 1-100, where 50 is baseline
    
    // Callbacks
    this.onPositionChange = options.onPositionChange || (() => {});
    this.onVelocityChange = options.onVelocityChange || (() => {});
  }
  
  setFriction(value) {
    this.friction = Math.max(5, Math.min(100, value));
  }
  
  setSensitivity(value) {
    this.sensitivity = Math.max(1, Math.min(100, value));
  }
  
  /**
   * Process a scroll input event
   * @param {number} amount - Raw scroll amount (1-127)
   * @param {string} direction - 'up' (clockwise) or 'down' (counter-clockwise)
   */
  processInput(amount, direction) {
    this.lastInputTime = Date.now();
    
    // Calculate target velocity based on input
    const inputSpeed = amount;
    const directionMultiplier = direction === 'up' ? 1 : -1;
    const targetVelocity = inputSpeed * this.targetMultiplier * directionMultiplier;
    
    // Calculate acceleration with friction
    const frictionFactor = Math.max(0.1, this.friction / 50);
    const accelerationRate = Math.min(0.5, 0.2 / frictionFactor);
    
    // Apply acceleration toward target
    const velocityDiff = targetVelocity - this.velocity;
    this.velocity += velocityDiff * accelerationRate;
    
    this.onVelocityChange(this.velocity);
    
    // Start animation if not already running
    if (!this.isAnimating) {
      this.startAnimation();
    }
  }
  
  startAnimation() {
    if (this.isAnimating) return;
    
    this.isAnimating = true;
    this.animationInterval = setInterval(() => {
      this.tick();
    }, 16); // ~60 FPS
  }
  
  stopAnimation() {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
    this.isAnimating = false;
  }
  
  tick() {
    const now = Date.now();
    const timeSinceInput = now - this.lastInputTime;
    
    // Stop if velocity is too small
    if (Math.abs(this.velocity) < this.velocityThreshold) {
      this.velocity = 0;
      this.stopAnimation();
      this.onVelocityChange(0);
      return;
    }
    
    // Apply friction if no recent input
    if (timeSinceInput > 50) {
      const frictionFactor = Math.max(0.1, this.friction / 50);
      const baseDecayRate = 0.92;
      const decayRate = Math.max(0.8, Math.min(0.99, 1 - ((1 - baseDecayRate) * frictionFactor)));
      this.velocity *= decayRate;
      
      // Check again if velocity dropped below threshold
      if (Math.abs(this.velocity) < this.velocityThreshold) {
        this.velocity = 0;
        this.stopAnimation();
        this.onVelocityChange(0);
        return;
      }
    }
    
    // Update position based on velocity with sensitivity scaling
    const scaledVelocity = this.velocity * (this.sensitivity / 50);
    const oldPosition = this.position;
    this.position += scaledVelocity;
    
    // Notify position change
    this.onPositionChange(this.position, scaledVelocity, oldPosition);
    this.onVelocityChange(this.velocity);
  }
  
  reset() {
    this.position = 0;
    this.velocity = 0;
    this.lastInputTime = 0;
    this.stopAnimation();
  }
  
  getState() {
    return {
      position: this.position,
      velocity: this.velocity,
      isAnimating: this.isAnimating
    };
  }
}
