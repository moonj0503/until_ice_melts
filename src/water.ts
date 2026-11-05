import { Color, ShaderMaterial } from 'three';
import type { Camera, Scene, WebGLRenderer } from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { PuddleGeometry } from './puddle-geometry.ts';

const waterShader = {
  name: 'ShallowWater',
  uniforms: {
    color: { value: new Color(0x10191e) },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    meltProgress: { value: 0 },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    attribute float wetRadius;
    varying vec4 reflectionUv;
    varying vec3 surfaceNormal;
    varying vec3 viewPosition;
    varying vec2 surfacePosition;
    varying float radial;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      reflectionUv = textureMatrix * vec4(position, 1.0);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      surfaceNormal = normalize(normalMatrix * normal);
      viewPosition = -mvPosition.xyz;
      surfacePosition = position.xy;
      radial = wetRadius;
      gl_Position = projectionMatrix * mvPosition;
      #include <logdepthbuf_vertex>
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float meltProgress;
    varying vec4 reflectionUv;
    varying vec3 surfaceNormal;
    varying vec3 viewPosition;
    varying vec2 surfacePosition;
    varying float radial;
    #include <common>
    #include <logdepthbuf_pars_fragment>
    void main() {
      #include <logdepthbuf_fragment>
      vec2 p = surfacePosition;
      // Microscopic surface variation, tied to melting rather than wall time.
      float phase = meltProgress * 9.0;
      vec2 ripple = vec2(
        cos(p.x * 19.0 + p.y * 13.0 + phase) + 0.4 * cos(p.y * 37.0 - phase),
        sin(p.y * 17.0 - p.x * 11.0 + phase) + 0.3 * sin(p.x * 41.0 + phase)
      ) * 0.003;
      vec3 normal = normalize(surfaceNormal + vec3(ripple, 0.0));
      vec3 viewDirection = normalize(viewPosition);
      float cosine = clamp(dot(normal, viewDirection), 0.0, 1.0);
      // Fresnel reflectance for the air/water boundary (IOR 1.333).
      float fresnel = 0.0204 + 0.9796 * pow(1.0 - cosine, 5.0);
      vec4 projected = reflectionUv;
      projected.xy += ripple * 0.12 * projected.w;
      vec4 reflected = texture2DProj(tDiffuse, projected);
      vec3 reflection = mix(color, reflected.rgb, reflected.a);
      vec3 lightDirection = normalize(vec3(-0.4, 0.75, 0.65));
      vec3 halfway = normalize(lightDirection + viewDirection);
      // The reflected scene is mostly the dark floor. A broad studio source
      // makes the wet surface readable while preserving water's Fresnel curve.
      float softLight = pow(max(dot(normal, halfway), 0.0), 10.0);
      reflection += vec3(0.16, 0.22, 0.26) * (0.24 + 0.76 * softLight);
      vec3 base = color * 1.07;
      vec3 result = mix(base, reflection, fresnel);
      float highlight = pow(max(dot(normal, halfway), 0.0), 170.0);
      result += vec3(0.62, 0.73, 0.78) * highlight * 0.4;
      // The curved meniscus catches light without drawing an outline stroke.
      float meniscus = smoothstep(0.93, 0.97, radial) * (1.0 - smoothstep(0.985, 1.0, radial));
      float edgeLight = 0.35 + 0.65 * max(dot(normal, lightDirection), 0.0);
      result += vec3(0.10, 0.14, 0.16) * meniscus * pow(1.0 - cosine, 2.0) * (0.075 + edgeLight * 0.3);
      gl_FragColor = vec4(result, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

export class WaterPuddle extends Reflector {
  private seed = 'preview';
  private segments: number;
  private reflectionPass: (renderer: WebGLRenderer, scene: Scene, camera: Camera) => void;

  constructor(mobile: boolean) {
    const segments = mobile ? 96 : 144;
    super(new PuddleGeometry('preview', segments), {
      shader: waterShader,
      color: 0x10191e,
      textureWidth: mobile ? 256 : 512,
      textureHeight: mobile ? 256 : 512,
      clipBias: 0.003,
      multisample: 0,
    });
    this.segments = segments;
    // The unlit floor uses display-referred color too. Avoid applying ACES a
    // second time to the shallow floor color, which otherwise looks like oil.
    (this.material as ShaderMaterial).toneMapped = false;
    // Update the reflection before the main draw, never recursively from the
    // ice's transmission pass (nested transmission corrupts renderer clear state).
    this.reflectionPass = this.onBeforeRender.bind(this) as typeof this.reflectionPass;
    this.onBeforeRender = () => {};
    this.rotation.x = -Math.PI / 2;
    this.position.set(0, 0.003, 0);
  }

  renderReflection(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    this.reflectionPass(renderer, scene, camera);
  }

  updateMelt(progress: number, radius: number, seed: string) {
    if (seed !== this.seed) {
      this.geometry.dispose();
      this.geometry = new PuddleGeometry(seed, this.segments);
      this.seed = seed;
    }
    this.scale.set(radius, radius, 1);
    (this.material as ShaderMaterial).uniforms.meltProgress.value = progress;
  }
}
