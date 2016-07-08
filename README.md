# WebGLSpins.js
Rendering Spins using WebGL and JavaScript.

## Installation

Just [download the minified JavaScript file](https://raw.githubusercontent.com/FlorianRhiem/WebGLSpins.js/master/webglspins.min.js) or clone this repository:
```shell
git clone https://github.com/FlorianRhiem/WebGLSpins.js.git
```

WebGLSpins.js has no dependencies to other JavaScript files, but it requires browser support of [WebGL 1.0](https://www.khronos.org/webgl/) and the [ANGLE_instanced_arrays](http://www.khronos.org/registry/webgl/extensions/ANGLE_instanced_arrays/) and [OES_element_index_uint](http://www.khronos.org/registry/webgl/extensions/OES_element_index_uint/) extensions.

## Usage Examples

A [static, minimal example](https://florianrhiem.github.io/WebGLSpins.js/examples/minimal.html) showing a single spin arrow:

```html
<canvas id="webgl-canvas" width="800" height="800"></canvas>
<script src="webglspins.js"></script>
<script type='text/javascript'>
  var webglspins = new WebGLSpins(document.getElementById('webgl-canvas'));
  webglspins.updateSpins(1, [0, 0, 0], [1, 0, 0]);
</script>
```

For a more complex examples showing the different colormaps and animated spins, see this [demo](https://florianrhiem.github.io/WebGLSpins.js/examples/demo.html).

## Documentation

To render spins on a canvas element, first create a WebGLSpins object:
```js
var webglspins = WebGLSpins(<HTMLCanvasElement> canvas, <options> options?);
```

| Options | Type | Default | Description |
|---|:-:|:-:|---|
| verticalFieldOfView | Number | 45.0 | Vertical field of view of camera. |
| allowCameraMovement | Boolean | true | Enable/Disable moving the camera using the mouse and the shift and alt keys. |
| cameraLocation | Array | [0.0, 0.0, 1.0] | Location of the camera. |
| centerLocation | Array | [0.0, 0.0, 0.0] | Location fo the point the camera is looking at. |
| upVector | Array | [0.0, 1.0, 0.0] | Direction that should be up. |
| backgroundColor | Array | [0.0, 0.0, 0.0] | Color of the background. |
| colormapImplementation | String | red&nbsp;(see&nbsp;below) | GLSL code for mapping spin direction to a color. |
| renderers | Array | [Arrows]&nbsp;(see&nbsp;below) | Array of renderers to use and (optionally) their viewports. |
| zRange | Array | [-1, 1] | The range of visible z values. Spins with a direction z component outside this range will not be rendered. |

Arrow renderer options:

| Options | Type | Default | Description |
|---|:-:|:-:|---|
| coneHeight | Number | 0.6 | Height of the spin cone/arrow tip. |
| coneRadius | Number | 0.25 | Radius of the spin cone/arrow tip. |
| cylinderHeight | Number | 0.7 | Height of the spin cylinder/arrow shaft. |
| cylinderRadius | Number | 0.125 | Radius of the spin cylinder/arrow shaft. |
| levelOfDetail | Number | 20 | Number of sides for the spin arrow mesh. Must be at least three. |

Surface renderer options:

| Options | Type | Default | Description |
|---|:-:|:-:|---|
| surfaceIndices | Array | [] | Array of indices for rendering a surface. |

Sphere renderer options:

| Options | Type | Default | Description |
|---|:-:|:-:|---|
| innerSphereRadius | Number | 0.95 | Radius of the gray sphere rendered inside the spin sphere. Use a radius of 0.0 to disable the sphere. |
| useFakePerspective | Boolean | false | The spin sphere is rendered using an orthographic perspective. If you wish to make distant points smaller anyway, set this option to true. |
| pointSizeRange | Array | [1,1] | Point size can vary due to position on the sphere and distance to the viewer (in case of the fake perspective). This sets the valid point size range. |

To change these options later on, use:
```js
webglspins.updateOptions(<options> options);
```

Use the following function to set the spin positions and directions:
```js
webglspins.updateSpins(<Number> n, <Array> spinPositions, <Array> spinDirections);
```

If you use a cartesian grid, you can generate the `surfaceIndices` for the surface render mode using:
```js
WebGLSpins.generateCartesianSurfaceIndices(<Number> nx, <Number> ny);
```

### Renderers

By default, spins are rendered as arrows using the full size of the canvas. However, WebGLSpins.js allows you to use multiple renderers, even at the same time. By setting the `renderers` option, you can specify an array of renders and (optionally) their viewports, e.g.:
```js
webglspins.updateOptions({
  renderers: [
    WebGLSpins.renderers.ARROWS,
    [WebGLSpins.renderers.SPHERE, [0.0, 0.0, 0.2, 0.2]
  ]
});
```

#### Arrows

Spins are rendered as arrows. This renderer is available as `WebGLSpins.renderModes.ARROWS`.

#### Surface

Spins are rendered as surface. To define the surface, WebGLSpins needs to know which points should be connected as triangles. To do this, set the `surfaceIndices` option to an array of indices into the spin position array. For example, if you only have three spins and want to render them as a triangle, use:
```js
webglspins.updateOptions({
  surfaceIndices: [0, 1, 2]
});
```

This renderer is available as `WebGLSpins.renderModes.SURFACE`.

#### Sphere

Spins are rendered as points on a sphere, with their position on the sphere defined by the spin direction. Camera zoom and translation are disabled in this renderer. This renderer is available as `WebGLSpins.renderModes.SPHERE`.

#### Coordinate System

Spins are not rendered. Instead, a coordinate system is rendered as lines, using the current colormap to color the axes. Camera zoom and translation are disabled in this renderer. This renderer is available as `WebGLSpins.renderModes.COORDINATESYSTEM`.

### Colormap implementations

There are three colormaps already available, basically as templates for your own: `red`, `redblue` and `hue`. These can be accessed as attributes of `WebGLSpins.colormapImplementations`.

#### Colormap 'red'
```glsl
vec3 colormap(vec3 direction) {
  return vec3(1.0, 0.0, 0.0);
}
```

#### Colormap 'redblue'
A transition from red for positive z to blue for negative z direction.
```glsl
vec3 colormap(vec3 direction) {
  vec3 color_down = vec3(0.0, 0.0, 1.0);
  vec3 color_up = vec3(1.0, 0.0, 0.0);
  return mix(color_down, color_up, direction.z*0.5+0.5);
}
```

#### Colormap 'hue'
The angle between z and y is mapped to a hue value between 0 and 1, with a positive z direction resulting in red.
```glsl
float atan2(float y, float x) {
  return x == 0.0 ? sign(y)*3.14159/2.0 : atan(y, x);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
vec3 colormap(vec3 direction) {
  vec2 xy = normalize(direction.yz);
  float hue = atan2(xy.x, xy.y) / 3.14159 / 2.0;
  return hsv2rgb(vec3(hue, 1.0, 1.0));
}
```
