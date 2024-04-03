import { Camera } from "../lib/webglutils/Camera.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { SkinningAnimation } from "./App.js";
import { Mat3, Mat4, Vec3, Vec4, Vec2, Mat2, Quat } from "../lib/TSM.js";
import { Bone } from "./Scene.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";

let RADIUS_BONE = 0.1;
/**
 * Might be useful for designing any animation GUI
 */
interface IGUI {
  viewMatrix(): Mat4;
  projMatrix(): Mat4;
  dragStart(me: MouseEvent): void;
  drag(me: MouseEvent): void;
  dragEnd(me: MouseEvent): void;
  onKeydown(ke: KeyboardEvent): void;
}

export enum Mode {
  playback,  
  edit  
}

export class KeyFrame {
  public bones: Bone[];

  constructor(bones: Bone[]) {
    this.bones = [];
    bones.forEach(bone => {
      this.bones.push(new Bone(bone));
    });
  }
}

	
/**
 * Handles Mouse and Button events along with
 * the the camera.
 */

export class GUI implements IGUI {
  private static readonly rotationSpeed: number = 0.05;
  private static readonly zoomSpeed: number = 0.1;
  private static readonly rollSpeed: number = 0.1;
  private static readonly panSpeed: number = 0.1;

  private camera: Camera;
  private dragging: boolean;
  private fps: boolean;
  private prevX: number;
  private prevY: number;

  private height: number;
  private viewPortHeight: number;
  private width: number;
  private viewPortWidth: number;

  private animation: SkinningAnimation;
  
  public keyFrames: KeyFrame[];

  private selectedBone: number;
  private boneDragging: boolean;

  public time: number;
  public mode: Mode;

  public hoverX: number = 0;
  public hoverY: number = 0;


  /**
   *
   * @param canvas required to get the width and height of the canvas
   * @param animation required as a back pointer for some of the controls
   * @param sponge required for some of the controls
   */
  constructor(canvas: HTMLCanvasElement, animation: SkinningAnimation) {
    this.height = canvas.height;
    this.viewPortHeight = this.height - 200;
    this.width = canvas.width;
    this.viewPortWidth = this.width - 320;
    this.prevX = 0;
    this.prevY = 0;
    this.keyFrames = [];
    
    this.animation = animation;
    
    this.reset();
    
    this.registerEventListeners(canvas);
  }

  public getNumKeyFrames(): number {
    //TODO: Fix for the status bar in the GUI
    return this.keyFrames.length;
    // return 0;
  }
  
  public getTime(): number { 
  	return this.time; 
  }
  
  public getMaxTime(): number { 
    //TODO: The animation should stop after the last keyframe
    return this.keyFrames.length-1;
  }

  /**
   * Resets the state of the GUI
   */
  public reset(): void {
    this.fps = false;
    this.dragging = false;
    this.boneDragging = false;
    this.selectedBone = NaN;
    this.time = 0;
	this.mode = Mode.edit;
    
    this.camera = new Camera(
      new Vec3([0, 0, -6]),
      new Vec3([0, 0, 0]),
      new Vec3([0, 1, 0]),
      45,
      this.viewPortWidth / this.viewPortHeight,
      0.1,
      1000.0
    );
  }

  /**
   * Sets the GUI's camera to the given camera
   * @param cam a new camera
   */
  public setCamera(
    pos: Vec3,
    target: Vec3,
    upDir: Vec3,
    fov: number,
    aspect: number,
    zNear: number,
    zFar: number
  ) {
    this.camera = new Camera(pos, target, upDir, fov, aspect, zNear, zFar);
  }

  /**
   * Returns the view matrix of the camera
   */
  public viewMatrix(): Mat4 {
    return this.camera.viewMatrix();
  }

  /**
   * Returns the projection matrix of the camera
   */
  public projMatrix(): Mat4 {
    return this.camera.projMatrix();
  }

  /**
   * Callback function for the start of a drag event.
   * @param mouse
   */
  public dragStart(mouse: MouseEvent): void {
    if (mouse.offsetY > 600) {
      // outside the main panel
      return;
    }
	
    // Rotate the bones, instead of moving the camera, if there is a currently highlighted bone
    if (!Number.isNaN(this.selectedBone)) {
      this.boneDragging = true;
    }
    
    this.dragging = true;
    this.prevX = mouse.screenX;
    this.prevY = mouse.screenY;
  }

  public incrementTime(dT: number): void {
    if (this.mode === Mode.playback) {
      this.time += dT;
      if (this.time >= this.getMaxTime()) {
        this.time = 0;
        this.mode = Mode.edit;
      }
    }
  }
  

  /**
   * The callback function for a drag event.
   * This event happens after dragStart and
   * before dragEnd.
   * @param mouse
   */
  public drag(mouse: MouseEvent): void {
    let x = mouse.offsetX;
    let y = mouse.offsetY;
    if (this.dragging) {
      const dx = mouse.screenX - this.prevX;
      const dy = mouse.screenY - this.prevY;
      this.prevX = mouse.screenX;
      this.prevY = mouse.screenY;

      /* Left button, or primary button */
      const mouseDir: Vec3 = this.camera.right();
      mouseDir.scale(-dx);
      mouseDir.add(this.camera.up().scale(dy));
      mouseDir.normalize();

      if (dx === 0 && dy === 0) {
        return;
      }

      if (this.boneDragging && mouse.buttons == 1.0) {
        // We have to rotate the bone instead of moving the camera
        const mesh = this.animation.getScene().meshes[0];

        let bonePosOnNdc = new Vec4([...mesh.bones[this.selectedBone].position.xyz, 1.0]);
        bonePosOnNdc = this.viewMatrix().copy().multiplyVec4(bonePosOnNdc);
        bonePosOnNdc = this.projMatrix().copy().multiplyVec4(bonePosOnNdc);
        bonePosOnNdc.scale(1/bonePosOnNdc.w);

        let boneEndpointOnNdc = new Vec4([...mesh.bones[this.selectedBone].endpoint.xyz, 1.0]);
        boneEndpointOnNdc = this.viewMatrix().copy().multiplyVec4(boneEndpointOnNdc);
        boneEndpointOnNdc = this.projMatrix().copy().multiplyVec4(boneEndpointOnNdc);
        boneEndpointOnNdc.scale(1/boneEndpointOnNdc.w);

        let vec1 = new Vec2(Vec4.difference(boneEndpointOnNdc, bonePosOnNdc).xy);
        
        let ndcX = 2.0 * mouse.offsetX / this.viewPortWidth - 1.0;
        let ndcY = 1.0 - (2.0 * mouse.offsetY / this.viewPortHeight);
        let mousePosInNdc = new Vec2([ndcX, ndcY]);

        let vec2 = Vec2.difference(mousePosInNdc, new Vec2(bonePosOnNdc.xy));

        vec1.normalize();
        vec2.normalize();

        let angle = Math.atan2(vec2.y, vec2.x) - Math.atan2(vec1.y, vec1.x);

        if (!Number.isNaN(this.selectedBone)) {
          mesh.bones[this.selectedBone].rotateBone(this.camera.forward(), angle);
          mesh.updateMesh(this.selectedBone, null, null);
        }
      }

      else {
        switch (mouse.buttons) {
          case 1: {
            let rotAxis: Vec3 = Vec3.cross(this.camera.forward(), mouseDir);
            rotAxis = rotAxis.normalize();
  
            if (this.fps) {
              this.camera.rotate(rotAxis, GUI.rotationSpeed);
            } else {
              this.camera.orbitTarget(rotAxis, GUI.rotationSpeed);
            }
            break;
          }
          case 2: {
            /* Right button, or secondary button */
            this.camera.offsetDist(Math.sign(mouseDir.y) * GUI.zoomSpeed);
            break;
          }
          default: {
            break;
          }
        }
      }   
    } 
    // Get normalized device coordinates 
    if (!this.dragging) {
      // convert to world coordinates
      let ndcX = 2.0 * x / this.viewPortWidth - 1.0
      let ndcY = 1.0 - (2.0 *y / this.viewPortHeight)
      let ndc = new Vec4([ndcX, ndcY, -1.0, 1.0])
      let projInverse = this.projMatrix().copy().inverse()
      let unproject = projInverse.multiplyVec4(ndc)
      unproject.w = 0.0
      let viewInv = this.viewMatrix().copy().inverse()
      let dir2 = viewInv.multiplyVec4(unproject)
      let mouse_dir = new Vec3([dir2.x, dir2.y, dir2.z])
      // get camera position
      let pos = this.camera.pos().copy();
      let mesh = this.animation.getScene().meshes[0]
      let bones = mesh.bones;
      let HighlightIndex = NaN;
      let minT = Number.MAX_SAFE_INTEGER;
      const intersects: number[] = []
      for (let i = 0; i < bones.length; i++) {
        let cur_bone = bones[i];
        // distance to be used in cylinder intersection
        let dist = Vec3.distance(cur_bone.endpoint, cur_bone.position);
        // obtain matrix
        let begin = cur_bone.position.copy();
        let end = cur_bone.endpoint.copy();
        const axis = end.copy().subtract(begin); 
        const tang = axis.normalize();
        const test_random = Vec3.dot(tang, new Vec3([0, 1, 0]))
        const random = Math.abs(test_random) < 0.999 ? new Vec3([0, 1, 0]) : new Vec3([1, 0, 0]);
        const y: Vec3 = Vec3.cross(tang, random).normalize();
        const x: Vec3 = Vec3.cross(tang, y).normalize();
        const Tmatrix =  new Mat3([
          y.x, y.y, y.z,
          tang.x, tang.y, tang.z,
          x.x, x.y, x.z]
        ).inverse();
        // rotation bone position and end point
        let dir_transformed = Tmatrix.copy().multiplyVec3(mouse_dir);
        let pos_transformed = Tmatrix.copy().multiplyVec3(pos.copy().subtract(cur_bone.position));
        // Cylinder intersection
        let result_intersection = this.intersectCilinder(pos_transformed, dir_transformed, dist);
        intersects.push(result_intersection)
      }

      // Highlight the minimum distance bone
      for (let i = 0; i < intersects.length; i++){
        if(!Number.isNaN(intersects[i])){
          if(intersects[i] <= minT){
            HighlightIndex = i;
            minT = intersects[i];
          }
        } 
        bones[i].isHighlight = false;
        this.selectedBone = NaN;
      }
      if(!Number.isNaN(HighlightIndex)){
        bones[HighlightIndex].isHighlight = true;
        this.selectedBone = HighlightIndex;
      } 

    }
  }
  // using ray tracer code
  intersectCilinder(pos: Vec3, dirNotN: Vec3, dist: number): number {
    // normalize direction
    const dir = dirNotN.copy().normalize()
    // solving quadratic
    const a = dir.x * dir.x + dir.z * dir.z;
    const b = 2 * (pos.x * dir.x + pos.z * dir.z);
    const c = pos.x * pos.x + pos.z * pos.z - RADIUS_BONE * RADIUS_BONE;
    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0.0) {
      return NaN;
    }
  
    const t1 = (-b - Math.sqrt(discriminant)) / (2.0 * a);
    const t2 = (-b + Math.sqrt(discriminant)) / (2.0 * a);

    const y1 = pos.y + t1 * dir.y;
    const y2 = pos.y + t2 * dir.y;
  
    let ans = Number.MAX_VALUE;
  
    if (y1 >= 0.0 && y1 <= dist) {
      ans = Math.min(ans, t1);
    }
  
    if (y2 >= 0.0 && y2 <= dist) {
      ans = Math.min(ans, t2);
    }
  
    if (ans === Number.MAX_VALUE) {
      return NaN;
    }
  
    return ans;
    
  }
  
  public getModeString(): string {
    switch (this.mode) {
      case Mode.edit: { return "edit: " + this.getNumKeyFrames() + " keyframes"; }
      case Mode.playback: { return "playback: " + this.getTime().toFixed(2) + " / " + this.getMaxTime().toFixed(2); }
    }
  }
  
  /**
   * Callback function for the end of a drag event
   * @param mouse
   */
  public dragEnd(mouse: MouseEvent): void {
    this.dragging = false;
    this.boneDragging = false;
    this.prevX = 0.0;
    this.prevY = 0.0;
	
    // TODO: Handle ending highlight/dragging logic as needed
  
  }

  /**
   * Callback function for a key press event
   * @param key
   */
  public onKeydown(key: KeyboardEvent): void {
    switch (key.code) {
      case "Digit1": {
        this.animation.setScene("./static/assets/skinning/split_cube.dae");
        break;
      }
      case "Digit2": {
        this.animation.setScene("./static/assets/skinning/long_cubes.dae");
        break;
      }
      case "Digit3": {
        this.animation.setScene("./static/assets/skinning/simple_art.dae");
        break;
      }      
      case "Digit4": {
        this.animation.setScene("./static/assets/skinning/mapped_cube.dae");
        break;
      }
      case "Digit5": {
        this.animation.setScene("./static/assets/skinning/robot.dae");
        break;
      }
      case "Digit6": {
        this.animation.setScene("./static/assets/skinning/head.dae");
        break;
      }
      case "Digit7": {
        this.animation.setScene("./static/assets/skinning/wolf.dae");
        break;
      }
      case "KeyW": {
        this.camera.offset(
            this.camera.forward().negate(),
            GUI.zoomSpeed,
            true
          );
        break;
      }
      case "KeyA": {
        this.camera.offset(this.camera.right().negate(), GUI.zoomSpeed, true);
        break;
      }
      case "KeyS": {
        this.camera.offset(this.camera.forward(), GUI.zoomSpeed, true);
        break;
      }
      case "KeyD": {
        this.camera.offset(this.camera.right(), GUI.zoomSpeed, true);
        break;
      }
      case "KeyR": {
        this.animation.reset();
        this.keyFrames = [];
        break;
      }
      case "ArrowLeft": {      
        let mesh = this.animation.getScene().meshes[0];
        let rotationAxis =  Vec3.difference(mesh.bones[this.selectedBone].initEndpoint, mesh.bones[this.selectedBone].initPosition);

        if (!Number.isNaN(this.selectedBone)) {
          mesh.bones[this.selectedBone].rotateBone(rotationAxis, GUI.rotationSpeed);
          mesh.updateMesh(this.selectedBone, null, null);
        } else {
          this.camera.roll(GUI.rollSpeed, false);
        }
        break;
      }
      case "ArrowRight": {
        let mesh = this.animation.getScene().meshes[0];
        let rotationAxis =  Vec3.difference(mesh.bones[this.selectedBone].initEndpoint, mesh.bones[this.selectedBone].initPosition);

        if (!Number.isNaN(this.selectedBone)) {
          mesh.bones[this.selectedBone].rotateBone(rotationAxis, -GUI.rotationSpeed);
          mesh.updateMesh(this.selectedBone, null, null);
        } else {
          this.camera.roll(GUI.rollSpeed, false);
        }
        break;
      }
      case "ArrowUp": {
        this.camera.offset(this.camera.up(), GUI.zoomSpeed, true);
        break;
      }
      case "ArrowDown": {
        this.camera.offset(this.camera.up().negate(), GUI.zoomSpeed, true);
        break;
      }
      case "KeyK": {
        if (this.mode === Mode.edit) {
		      //TODO: Add keyframes if required by project spec
          this.keyFrames.push(new KeyFrame(this.animation.getScene().meshes[0].bones));
        }
        break;
      }      
      case "KeyP": {
        if (this.mode === Mode.edit && this.getNumKeyFrames() > 1)
        {
          this.mode = Mode.playback;
          this.time = 0;
        } else if (this.mode === Mode.playback) {
          this.mode = Mode.edit;
        }
        break;
      }
      default: {
        console.log("Key : '", key.code, "' was pressed.");
        break;
      }
    }
  }

  /**
   * Registers all event listeners for the GUI
   * @param canvas The canvas being used
   */
  private registerEventListeners(canvas: HTMLCanvasElement): void {
    /* Event listener for key controls */
    window.addEventListener("keydown", (key: KeyboardEvent) =>
      this.onKeydown(key)
    );

    /* Event listener for mouse controls */
    canvas.addEventListener("mousedown", (mouse: MouseEvent) =>
      this.dragStart(mouse)
    );

    canvas.addEventListener("mousemove", (mouse: MouseEvent) =>
      this.drag(mouse)
    );

    canvas.addEventListener("mouseup", (mouse: MouseEvent) =>
      this.dragEnd(mouse)
    );

    /* Event listener to stop the right click menu */
    canvas.addEventListener("contextmenu", (event: any) =>
      event.preventDefault()
    );
  }
}
