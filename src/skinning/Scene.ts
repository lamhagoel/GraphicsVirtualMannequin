import { Mat4, Quat, Vec3 } from "../lib/TSM.js";
import { AttributeLoader, MeshGeometryLoader, BoneLoader, MeshLoader } from "./AnimationFileLoader.js";

//TODO: Generate cylinder geometry for highlighting bones

//General class for handling GLSL attributes
export class Attribute {
  values: Float32Array;
  count: number;
  itemSize: number;

  constructor(attr: AttributeLoader) {
    this.values = attr.values;
    this.count = attr.count;
    this.itemSize = attr.itemSize;
  }
}

//Class for handling mesh vertices and skin weights
export class MeshGeometry {
  position: Attribute;
  normal: Attribute;
  uv: Attribute | null;
  skinIndex: Attribute; // bones indices that affect each vertex
  skinWeight: Attribute; // weight of associated bone
  v0: Attribute; // position of each vertex of the mesh *in the coordinate system of bone skinIndex[0]'s joint*. Perhaps useful for LBS.
  v1: Attribute;
  v2: Attribute;
  v3: Attribute;

  constructor(mesh: MeshGeometryLoader) {
    this.position = new Attribute(mesh.position);
    this.normal = new Attribute(mesh.normal);
    if (mesh.uv) { this.uv = new Attribute(mesh.uv); }
    this.skinIndex = new Attribute(mesh.skinIndex);
    this.skinWeight = new Attribute(mesh.skinWeight);
    this.v0 = new Attribute(mesh.v0);
    this.v1 = new Attribute(mesh.v1);
    this.v2 = new Attribute(mesh.v2);
    this.v3 = new Attribute(mesh.v3);
  }
}

//Class for handling bones in the skeleton rig
export class Bone {
  public parent: number;
  public children: number[];
  public position: Vec3; // current position of the bone's joint *in world coordinates*. Used by the provided skeleton shader, so you need to keep this up to date.
  public endpoint: Vec3; // current position of the bone's second (non-joint) endpoint, in world coordinates
  public rotation: Quat; // current orientation of the joint *with respect to world coordinates*
  public isHighlight: boolean; // set to true if the bone is highlighted

  // We'll compute them on the fly as needed instead of always maintaining them - so make sure to compute them before needed
  // public U_i: Mat4;
  // public D_i: Mat4;
  public T_ij: Mat4;
  public R_i: Quat; // is Mat4 in slides, but we use Quat because easy to compose, and we can easily convert from axis angle to quat, and quat to Mat4 as needed

  public initPosition: Vec3;
  public initEndpoint: Vec3;

  constructor(bone: BoneLoader) {
    this.parent = bone.parent;
    this.children = Array.from(bone.children);
    this.position = bone.position.copy();
    this.endpoint = bone.endpoint.copy();
    this.rotation = bone.rotation.copy();
    this.isHighlight = false;

    this.initPosition = this.position.copy();
    // console.log("Init positions", this.initPosition.xyz);
    this.initEndpoint = this.endpoint.copy();

    // TODO: Initialize correctly wrt parent bones
    // this.U_i = new Mat4().setIdentity();
    // this.D_i = new Mat4().setIdentity();
    this.T_ij = new Mat4().setIdentity(); // We fix this initialization after initializing all bones
    this.R_i = new Quat().setIdentity();
  }

  public rotateBone(axis: Vec3, angle: number) {
    console.log("Axis for rotation", axis.xyz, "Quat to multiply", Quat.fromAxisAngle(axis, angle).xyzw);
    this.R_i.multiply(Quat.fromAxisAngle(axis, angle));
  }
}

//Class for handling the overall mesh and rig
export class Mesh {
  public geometry: MeshGeometry;
  public worldMatrix: Mat4; // in this project all meshes and rigs have been transformed into world coordinates for you
  public rotation: Vec3;
  public bones: Bone[];
  public materialName: string;
  public imgSrc: String | null;

  private boneIndices: number[];
  private bonePositions: Float32Array;
  private boneIndexAttribute: Float32Array;

  // public selectedBone: Bone | null; // to know if the mesh bone is selected

  constructor(mesh: MeshLoader) {
    this.geometry = new MeshGeometry(mesh.geometry);
    this.worldMatrix = mesh.worldMatrix.copy();
    this.rotation = mesh.rotation.copy();
    this.bones = [];
    mesh.bones.forEach(bone => {
      this.bones.push(new Bone(bone));
    });
    this.bones.forEach(bone => {
      let translation: Vec3 = bone.initPosition;
      if (bone.parent != -1) {
        translation.subtract(this.bones[bone.parent].initPosition);
      }
      bone.T_ij.translate(translation);
    });
    this.materialName = mesh.materialName;
    this.imgSrc = null;
    this.boneIndices = Array.from(mesh.boneIndices);
    this.bonePositions = new Float32Array(mesh.bonePositions);
    this.boneIndexAttribute = new Float32Array(mesh.boneIndexAttribute);
  }

  //TODO: Create functionality for bone manipulation/key-framing

  public getU_i(bone: number): Mat4 {
    let U_i = new Mat4().setIdentity();
    let curBone = this.bones[bone];
    let parent = curBone.parent;
    if (parent == -1) {
      // Root bone/joint
      U_i.translate(curBone.initPosition);
      return U_i;
    }

    let U_parent = this.getU_i(parent);
    return Mat4.product(U_parent, curBone.T_ij);
  };

  public getD_i(bone: number): Mat4 {
    let D_i = new Mat4().setIdentity();
    let curBone = this.bones[bone];
    let parent = curBone.parent;
    if (parent == -1) {
      // Root bone/joint
      D_i.translate(curBone.initPosition);
      console.log("Root D_i", D_i.all(), curBone.initPosition.xyz);
      return D_i.multiply(curBone.R_i.toMat4());
    }

    let D_parent = this.getD_i(parent);
    return Mat4.product(D_parent, (Mat4.product(curBone.T_ij, curBone.R_i.toMat4())));
  };

  public getR_i(bone: number): Quat {
    let curBone = this.bones[bone];
    let R_i = curBone.R_i;
    let parent = curBone.parent;
    if (parent == -1) {
      // Root bone/joint
      return R_i;
    }

    let R_parent = this.getR_i(parent);
    return Quat.product(R_parent, curBone.R_i);
  };

  public updateMesh(bone: number, D_parent: Mat4 | null, rot_parent: Quat | null) {
    console.log("Updating mesh", bone, rot_parent);
    //TODO: Implement
    let D_i: Mat4;
    let rotation_i: Quat;
    // let T_i: Mat4;  // Translation component of D_i

    let boneInstance = this.bones[bone];
    // Update position and rotate from D_i for this bone and all child bones
    if (D_parent == null || rot_parent == null) {
      D_i = this.getD_i(bone);   
      rotation_i = boneInstance.R_i; // TODO: check if we need to do this, or just take current R_i or this.getR_i(bone);
      console.log(D_i.all(), rotation_i.xyzw);
    }
    else {
      D_i = Mat4.product(D_parent, Mat4.product(boneInstance.T_ij, boneInstance.R_i.toMat4()));
      rotation_i = Quat.product(rot_parent, boneInstance.R_i);
    }

    // T_i = new Mat4().setIdentity();
    // T_i.translate(new Vec3([D_i[12], D_i[13], D_i[14]]));

    boneInstance.position = D_i.multiplyPt3(new Vec3([0,0,0])); // Initial position will be origin in the local system
    boneInstance.endpoint = D_i.multiplyPt3(Vec3.difference(boneInstance.initEndpoint,boneInstance.initPosition));
    boneInstance.rotation = rotation_i;

    for (let i = 0; i < boneInstance.children.length; i++) {
      this.updateMesh(boneInstance.children[i], D_i, rotation_i);
    }

  }

  public getBoneIndices(): Uint32Array {
    return new Uint32Array(this.boneIndices);
  }

  public getBonePositions(): Float32Array {
    return this.bonePositions;
  }

  public getBoneIndexAttribute(): Float32Array {
    return this.boneIndexAttribute;
  }

  public getBoneTranslations(): Float32Array {
    let trans = new Float32Array(3 * this.bones.length);
    this.bones.forEach((bone, index) => {
      let res = bone.position.xyz;
      for (let i = 0; i < res.length; i++) {
        trans[3 * index + i] = res[i];
      }
    });
    return trans;
  }

  public getBoneRotations(): Float32Array {
    let trans = new Float32Array(4 * this.bones.length);
    this.bones.forEach((bone, index) => {
      let res = bone.rotation.xyzw;
      for (let i = 0; i < res.length; i++) {
        trans[4 * index + i] = res[i];
      }
    });
    return trans;
  }

  public getBoneColors(): Float32Array {
    let color = new Float32Array(4 * this.bones.length);
    this.bones.forEach((bone, index) => {
      if(bone.isHighlight) {
        color[index * 4] = 0.0;
        color[index * 4 + 1] = 1.0;
        color[index * 4 + 2] = 0.0;
        color[index * 4 + 3] = 1.0;
      }
      else {
        color[index * 4] = 1.0;
        color[index * 4 + 1] = 0.0;
        color[index * 4 + 2] = 0.0;
        color[index * 4 + 3] = 1.0;
      }
    });
    return color;
  }
  // TODO: change

}