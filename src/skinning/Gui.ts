import { Camera } from "../lib/webglutils/Camera.js";
import { CanvasAnimation } from "../lib/webglutils/CanvasAnimation.js";
import { SkinningAnimation } from "./App.js";
import { Mat3, Mat4, Vec3, Vec4, Vec2, Mat2, Quat } from "../lib/TSM.js";
import { Bone } from "./Scene.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";

let RAY_EPSILON = 0.0001;
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

  private animation: SkinningAnimation;

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
    this.prevX = 0;
    this.prevY = 0;
    
    this.animation = animation;
    
    this.reset();
    
    this.registerEventListeners(canvas);
  }

  public getNumKeyFrames(): number {
    //TODO: Fix for the status bar in the GUI
    return 0;
  }
  
  public getTime(): number { 
  	return this.time; 
  }
  
  public getMaxTime(): number { 
    //TODO: The animation should stop after the last keyframe
    return 0;
  }

  /**
   * Resets the state of the GUI
   */
  public reset(): void {
    this.fps = false;
    this.dragging = false;
    this.time = 0;
	this.mode = Mode.edit;
    
    this.camera = new Camera(
      new Vec3([0, 0, -6]),
      new Vec3([0, 0, 0]),
      new Vec3([0, 1, 0]),
      45,
      this.width / this.viewPortHeight,
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
	
    // TODO: Add logic to rotate the bones, instead of moving the camera, if there is a currently highlighted bone
    
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

      switch (mouse.buttons) {
        case 1: {
          let rotAxis: Vec3 = Vec3.cross(this.camera.forward(), mouseDir);
          rotAxis = rotAxis.normalize();

          if (this.fps) {
            this.camera.rotate(rotAxis, GUI.rotationSpeed);
          } else {
            this.camera.orbitTarget(rotAxis, GUI.rotationSpeed);
          }
          // TODO: include left click with highlight == true
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
    // TODO: Add logic here:
    // 1) To highlight a bone, if the mouse is hovering over a bone;
    // 2) To rotate a bone, if the mouse button is pressed and currently highlighting a bone.
    // Get normalized device coordinates 
    if (!this.dragging) {
      // We're moving the mouse - mode 1
      // Convert to world coordinates and then check for ray-cylinder intersection
      let NDC: Vec4 = new Vec4([(2.0 * x / this.width) - 1.0, (-2.0 * y / this.viewPortHeight) + 1.0, -1.0, 1.0]);
      let m_world_coor: Vec4 = this.viewMatrix().inverse().multiplyVec4(this.projMatrix().inverse().multiplyVec4(NDC));
      // TODO: I think it is ok to scale after all the multiplications (same as in between view and proj multiplication?)
      // .scale scales a vec4 by a scalar number, w should be 1
      m_world_coor.scale(m_world_coor.w);
      // get ray direction 
      let mouse_dir = new Vec3([m_world_coor.x, m_world_coor.y, m_world_coor.z]);
      let pos = this.camera.pos();
      let dir = Vec3.difference(mouse_dir, pos).normalize();
      
      let mesh = this.animation.getScene().meshes[0]
      let bones = mesh.bones;
      let i = 0;
      let minimum_t = Number.MAX_VALUE;
      let selected_bone: Bone | null = null; 

      while (i < bones.length) {
        let cur_bone = bones[i];
        let axis: Vec3 = Vec3.difference(cur_bone.endpoint, cur_bone.position);
        let tang = axis.normalize();
        // TODO: I saw this on internet, have no idea why we do this next two lines
        // TODO: remove comment
        let test_random = Vec3.dot(tang, new Vec3([0, 1, 0]))
        let random = Math.abs(test_random) < 0.999 ? new Vec3([0, 1, 0]) : new Vec3([1, 0, 0]);
        let y: Vec3 = Vec3.cross(tang, random).normalize();
        let x: Vec3 = Vec3.cross(tang, y).normalize();
        let Tmatrix: Mat3 = new Mat3([
          y.x, y.y, y.z,
          tang.x, tang.y, tang.z,
          x.x, x.y, x.z]
        ).inverse();
        // rotation bone position and end point
        let dir_transformed = Tmatrix.copy().multiplyVec3(dir).normalize();
        let pos_transformed = Tmatrix.copy().multiplyVec3(pos.copy())
        let bone_position_transformed: Vec3 = Tmatrix.multiplyVec3(cur_bone.position);
        let bone_endpoint_transformed: Vec3 = Tmatrix.multiplyVec3(cur_bone.endpoint);
        // translate the position in local coordiantes to 
        let pos_in_local = Vec3.difference(pos_transformed, bone_position_transformed);
        let end_in_local = Vec3.difference(bone_endpoint_transformed, bone_position_transformed)
        // Cylinder intersection
        let min = Math.min(0.0, end_in_local.z);
        let max = Math.max(0.0, end_in_local.z);
        let result_intersection = this.intersectCilinder(pos_in_local, dir_transformed, min, max);
        // check result
        // TODO: I think we can just break the while loop if we just find the first that matches
        // I do not know if it makes any difference in cases where bones are ver close? ray_epsilon is quite small
        if (result_intersection < minimum_t) {
          minimum_t = result_intersection;
          selected_bone = cur_bone;
        // if it is selected we need to make it false
        } else if(cur_bone.isHighlight) {
          bones[i].isHighlight = false;
          mesh.selectedBone = null;
        }
        i += 1;
      }
      // highlight the selected bone and set the bone to the mesh
      if (selected_bone != null) {
        mesh.selectedBone = selected_bone;
        mesh.selectedBone.isHighlight = true;
      }
      
    }
  }
  // using ray tracer code
  public intersectCilinder(pos_in_local: Vec3, dir_transformed: Vec3, min: number, max: number): number {
    let a = Math.pow(dir_transformed.x, 2) + Math.pow(dir_transformed.y, 2);
    let b = 2.0 * (pos_in_local.x * dir_transformed.x + pos_in_local.y * dir_transformed.y);
    // TODO: confirm 0.1
    let c = pos_in_local.x * pos_in_local.x + pos_in_local.y * pos_in_local.y - 0.1 * 0.1;
    let discriminant = (Math.pow(b, 2) - 4*a*c);
    if (0.0 == a || discriminant < 0.0) {
      // This implies that x1 = 0.0 and y1 = 0.0, which further
      // implies that the ray is aligned with the body of the
      // cylinder, so no intersection.
      return Number.MAX_SAFE_INTEGER;
      // TODO: confirm if break here
    } else {
      // solving quadratic ecuation
      let x1 = ( (-1 * b) + Math.sqrt(discriminant))/ (2*a)
      let x2 = ( (-1 * b) - Math.sqrt(discriminant))/ (2*a)

      if (x2 <= RAY_EPSILON) {
        return Number.MAX_SAFE_INTEGER;
      }

      if (x1 > RAY_EPSILON) {
          // Two intersections.
          let P: Vec3 = Vec3.sum(pos_in_local, dir_transformed.scale(x1));
          let z = P.z;
          if (z >= min && z <= max) {
              return x1;
          }
      }

      let P: Vec3 = Vec3.sum(pos_in_local, dir_transformed.scale(x2));
      let z = P.z;
      if (z >= min && z <= max) {
          return x2;
      } 
    }
    return Number.MAX_SAFE_INTEGER;
  }
  // TODO: USE THE RAY TRACER INTERSECTION
  // bool Cylinder::intersectBody(const ray &r, isect &i) const {
  //   double x0 = r.getPosition()[0];
  //   double y0 = r.getPosition()[1];
  //   double x1 = r.getDirection()[0];
  //   double y1 = r.getDirection()[1];
  
  //   double a = x1 * x1 + y1 * y1;
  //   double b = 2.0 * (x0 * x1 + y0 * y1);
  //   double c = x0 * x0 + y0 * y0 - 1.0;
  
  //   if (0.0 == a) {
  //     // This implies that x1 = 0.0 and y1 = 0.0, which further
  //     // implies that the ray is aligned with the body of the
  //     // cylinder, so no intersection.
  //     return false;
  //   }
  
  //   double discriminant = b * b - 4.0 * a * c;
  
  //   if (discriminant < 0.0) {
  //     return false;
  //   }
  
  //   discriminant = sqrt(discriminant);
  
  //   double t2 = (-b + discriminant) / (2.0 * a);
  
  //   if (t2 <= RAY_EPSILON) {
  //     return false;
  //   }
  
  //   double t1 = (-b - discriminant) / (2.0 * a);
  
  //   if (t1 > RAY_EPSILON) {
  //     // Two intersections.
  //     glm::dvec3 P = r.at(t1);
  //     double z = P[2];
  //     if (z >= 0.0 && z <= 1.0) {
  //       // It's okay.
  //       i.setT(t1);
  //       i.setN(glm::normalize(glm::dvec3(P[0], P[1], 0.0)));
  //       return true;
  //     }
  //   }
  
  //   glm::dvec3 P = r.at(t2);
  //   double z = P[2];
  //   if (z >= 0.0 && z <= 1.0) {
  //     i.setT(t2);
  
  //     glm::dvec3 normal(P[0], P[1], 0.0);
  //     // In case we are _inside_ the _uncapped_ cone, we need to flip
  //     // the normal. Essentially, the cone in this case is a
  //     // double-sided surface and has _2_ normals
  //     if (!capped && glm::dot(normal, r.getDirection()) > 0)
  //       normal = -normal;
  
  //     i.setN(glm::normalize(normal));
  //     return true;
  //   }
  
  //   return false;
  // }

  
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
    this.prevX = 0;
    this.prevY = 0;
	
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
        break;
      }
      case "ArrowLeft": {
		//TODO: Handle bone rolls when a bone is selected
		this.camera.roll(GUI.rollSpeed, false);
        break;
      }
      case "ArrowRight": {
		//TODO: Handle bone rolls when a bone is selected
		this.camera.roll(GUI.rollSpeed, true);
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
