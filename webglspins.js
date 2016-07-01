"use strict";

function WebGLSpins(canvas, options) {
    this._canvas = canvas;
    var defaultOptions = {
        coneHeight: 0.6,
        coneRadius: 0.25,
        cylinderHeight: 0.7,
        cylinderRadius: 0.125,
        levelOfDetail: 20,
        verticalFieldOfView: 45,
        allowCameraMovement: true,
        colormapImplementation: WebGLSpins.colormapImplementations['red'],
        cameraLocation: [0, 0, 1],
        centerLocation: [0, 0, 0],
        upVector: [0, 1, 0],
        backgroundColor: [0, 0, 0]
    };
    this._options = {};
    this._mergeOptions(options, defaultOptions);
    this._gl = null;
    this._gl_initialized = false;
    this._program = null;
    this._vbo = null;
    this._ibo = null;
    this._instancePositionVbo = 0;
    this._instanceDirectionVbo = 0;
    this._numIndices = 0;
    this._numInstances = 0;
    this._initGLContext();

    this._mouseDown = false;
    this._lastMouseX = null;
    this._lastMouseY = null;
    canvas.addEventListener('mousewheel', this._handleMouseScroll.bind(this));
    canvas.addEventListener('DOMMouseScroll', this._handleMouseScroll.bind(this));
    canvas.addEventListener('mousedown', this._handleMouseDown.bind(this));
    canvas.addEventListener('mousemove', this._handleMouseMove.bind(this));
    document.addEventListener('mouseup', this._handleMouseUp.bind(this));
}

WebGLSpins.prototype.updateOptions = function(options) {
    var optionsChanged = false;
    for (var option in options) {
        if (this._options.hasOwnProperty(option)) {
            if (this._options[option] !== options[option]) {
                this._options[option] = options[option];
                optionsChanged = true;
            }
        } else {
            console.warn("WebGLSpins does not recognize option '" + option +"'.");
        }
    }
    if (optionsChanged) {
        this._updateVertexData();
    }
    if (options.hasOwnProperty('colormapImplementation')) {
        this._updateShaderProgram();
    }
    this.draw();
};

WebGLSpins.prototype.updateSpins = function(numInstances, instancePositions, instanceDirections) {
    var gl = this._gl;
    this._numInstances = numInstances;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._instancePositionVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(instancePositions), gl.STREAM_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._instanceDirectionVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(instanceDirections), gl.STREAM_DRAW);
    this.draw();
};

WebGLSpins.prototype.draw = function() {
    var gl = this._gl;
    // Adjust framebuffer resolution to canvas resolution
    var width = this._canvas.clientWidth;
    var height = this._canvas.clientHeight;
    this._canvas.width = width;
    this._canvas.height = height;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    // Redraw
    gl.clearColor(this._options.backgroundColor[0], this._options.backgroundColor[1], this._options.backgroundColor[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (this._numInstances <= 0) {
        return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 4*3*2, 0);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 4*3*2, 4*3);
    gl.enableVertexAttribArray(1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._instancePositionVbo);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribDivisor(2, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._instanceDirectionVbo);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribDivisor(3, 1);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._ibo);

    gl.useProgram(this._program);

    //var projectionMatrix = mat4.create();
    //mat4.perspective(projectionMatrix, this._options.verticalFieldOfView, width / height, 0.1, 10000);
    var projectionMatrix = WebGLSpins._perspectiveProjectionMatrix(this._options.verticalFieldOfView, width / height, 0.1, 10000);
    gl.uniformMatrix4fv(gl.getUniformLocation(this._program, "uProjectionMatrix"), false, WebGLSpins._toFloat32Array(projectionMatrix));
    var modelviewMatrix = WebGLSpins._lookAtMatrix(this._options.cameraLocation, this._options.centerLocation, this._options.upVector);
    gl.uniformMatrix4fv(gl.getUniformLocation(this._program, "uModelviewMatrix"), false, WebGLSpins._toFloat32Array(modelviewMatrix));
    var lightPosition = WebGLSpins._matrixMultiply(modelviewMatrix, this._options.cameraLocation);
    gl.uniform3f(gl.getUniformLocation(this._program, "uLightPosition"), lightPosition[0], lightPosition[1], lightPosition[2]);

    gl.drawElementsInstanced(gl.TRIANGLES, this._numIndices, gl.UNSIGNED_SHORT, null, this._numInstances);

};

WebGLSpins.colormapImplementations = {
    'red': `
          vec3 colormap(vec3 direction) {
              return vec3(1.0, 0.0, 0.0);
          }`,
    'redblue': `
          vec3 colormap(vec3 direction) {
              vec3 color_down = vec3(0.0, 0.0, 1.0);
              vec3 color_up = vec3(1.0, 0.0, 0.0);
              return mix(color_down, color_up, direction.z*0.5+0.5);
          }`,
    'hue': `
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
        }`
};

WebGLSpins.prototype._mergeOptions = function(options, defaultOptions) {
    this._options = {};
    for (var option in defaultOptions) {
        this._options[option] = defaultOptions[option];
    }
    for (var option in options) {
        if (defaultOptions.hasOwnProperty(option)) {
            this._options[option] = options[option];
        } else {
            console.warn("WebGLSpins does not recognize option '" + option +"'.");
        }
    }
};

WebGLSpins.prototype._initGLContext = function() {
    var gl = null;
    try {
      gl = this._canvas.getContext("webgl") || this._canvas.getContext("experimental-webgl");
    } catch (e) {
    }
    if (!gl) {
      console.error("WebGLSpins was unable to initialize WebGL.");
      return;
    }
    this._gl = gl;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);

    // Add extensions functions and constants to the context:
    var angle_instanced_arrays_ext = gl.getExtension("ANGLE_instanced_arrays");
    if (!angle_instanced_arrays_ext) {
        console.error('WebGL does not support ANGLE_instanced_arrays required by WebGLSpins');
        return;
    }
    gl.drawArraysInstanced = angle_instanced_arrays_ext.drawArraysInstancedANGLE.bind(angle_instanced_arrays_ext);
    gl.drawElementsInstanced = angle_instanced_arrays_ext.drawElementsInstancedANGLE.bind(angle_instanced_arrays_ext);
    gl.vertexAttribDivisor = angle_instanced_arrays_ext.vertexAttribDivisorANGLE.bind(angle_instanced_arrays_ext);
    gl.VERTEX_ATTRIB_ARRAY_DIVISOR = angle_instanced_arrays_ext.VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE;

    this._vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 4*3*2, 0);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 4*3*2, 4*3);
    gl.enableVertexAttribArray(1);
    this._ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._ibo);
    this._numIndices = 0;

    this._instancePositionVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._instancePositionVbo);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribDivisor(2, 1);

    this._instanceDirectionVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._instanceDirectionVbo);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribDivisor(3, 1);
    this._numInstances = 0;

    this._updateShaderProgram();
    this._updateVertexData();

    this._gl_initialized = true;
};

WebGLSpins.prototype._updateShaderProgram = function() {
    var gl = this._gl;
    if (this._program) {
        gl.deleteProgram(this._program);
    }

    var vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, `
        #version 100
        precision highp float;
        
        uniform mat4 uProjectionMatrix;
        uniform mat4 uModelviewMatrix;
        attribute vec3 ivPosition;
        attribute vec3 ivNormal;
        attribute vec3 ivInstanceOffset;
        attribute vec3 ivInstanceDirection;
        varying vec3 vfPosition;
        varying vec3 vfNormal;
        varying vec3 vfColor;
        
        mat3 matrixFromDirection(vec3 direction) {
          float c = direction.z;
          float s = length(direction.xy);
          float x = -direction.y / s;
          float y = direction.x / s;
          mat3 matrix;
          matrix[0][0] = x*x*(1.0-c)+c;
          matrix[0][1] = y*x*(1.0-c);
          matrix[0][2] = -y*s;
          matrix[1][0] = x*y*(1.0-c);
          matrix[1][1] = y*y*(1.0-c)+c;
          matrix[1][2] = x*s;
          matrix[2][0] = y*s;
          matrix[2][1] = -x*s;
          matrix[2][2] = c;
          return matrix;
        }
        
        vec3 colormap(vec3 direction);
        
        void main(void) {
          vfColor = colormap(ivInstanceDirection);
          mat3 instanceMatrix = matrixFromDirection(ivInstanceDirection);
          vfNormal = (uModelviewMatrix * vec4(instanceMatrix*ivNormal, 0.0)).xyz;
          vfPosition = (uModelviewMatrix * vec4(instanceMatrix*ivPosition+ivInstanceOffset, 1.0)).xyz;
          gl_Position = uProjectionMatrix * vec4(vfPosition, 1.0);
        }
    `+this._options.colormapImplementation);
    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
        console.error("vertex shader info log:\n" + gl.getShaderInfoLog(vertexShader));
        return;
    }

    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, `
        #version 100
        precision highp float;
        
        uniform vec3 uLightPosition;
        varying vec3 vfPosition;
        varying vec3 vfNormal;
        varying vec3 vfColor;
        
        void main(void) {
          vec3 cameraLocation = vec3(0, 0, 0);
          vec3 normal = normalize(vfNormal);
          vec3 lightDirection = normalize(uLightPosition-vfPosition);
          vec3 reflectionDirection = normalize(reflect(lightDirection, normal));
          float specular = 0.2*pow(max(0.0, -reflectionDirection.z), 8.0);
          float diffuse = 0.7*max(0.0, dot(normal, lightDirection));
          float ambient = 0.2;
          gl_FragColor = vec4((ambient+diffuse)*vfColor + specular*vec3(1, 1, 1), 1.0);
        }
    `);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        console.error("fragment shader info log:\n" + gl.getShaderInfoLog(fragmentShader));
        return;
    }

    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.bindAttribLocation(program, 0, 'ivPosition');
    gl.bindAttribLocation(program, 1, 'ivNormal');
    gl.bindAttribLocation(program, 2, 'ivInstanceOffset');
    gl.bindAttribLocation(program, 3, 'ivInstanceDirection');
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("program info log:\n" + gl.getProgramInfoLog(program));
        return;
    }
    this._program = program;
}

WebGLSpins.prototype._updateVertexData = function() {
    var gl = this._gl;
    
    var levelOfDetail = this._options.levelOfDetail;
    var coneHeight = this._options.coneHeight;
    var coneRadius = this._options.coneRadius;
    var cylinderHeight = this._options.cylinderHeight;
    var cylinderRadius = this._options.cylinderRadius;

    // Enforce valid range
    if (levelOfDetail < 3) {
      levelOfDetail = 3;
    }
    if (coneHeight < 0) {
      coneHeight = 0;
    }
    if (coneRadius < 0) {
      coneRadius = 0;
    }
    if (cylinderHeight < 0) {
      cylinderHeight = 0;
    }
    if (cylinderRadius < 0) {
      cylinderRadius = 0;
    }
    var i;
    var baseNormal = [0, 0, -1];
    var zOffset = (cylinderHeight-coneHeight)/2;
    var l = Math.sqrt(coneRadius*coneRadius+coneHeight*coneHeight);
    var f1 = coneRadius/l;
    var f2 = coneHeight/l;
    var alpha;
    var position;
    var vertexData = [];
    // The tip has no normal to prevent a discontinuity.
    Array.prototype.push.apply(vertexData, [0, 0, zOffset+coneHeight]);
    Array.prototype.push.apply(vertexData, [0, 0, 0]);
    for (i = 0; i < levelOfDetail; i++) {
        alpha = 2*Math.PI*i/levelOfDetail;
        position = [coneRadius*Math.cos(alpha), coneRadius*Math.sin(alpha), zOffset];
        var normal = [f2*Math.cos(alpha), f2*Math.sin(alpha), f1];
        Array.prototype.push.apply(vertexData, position);
        Array.prototype.push.apply(vertexData, normal);
    }
    for (i = 0; i < levelOfDetail; i++) {
        alpha = 2*Math.PI*i/levelOfDetail;
        position = [coneRadius*Math.cos(alpha), coneRadius*Math.sin(alpha), zOffset];
        Array.prototype.push.apply(vertexData, position);
        Array.prototype.push.apply(vertexData, baseNormal);
    }
    for (i = 0; i < levelOfDetail; i++) {
        alpha = 2*Math.PI*i/levelOfDetail;
        position = [cylinderRadius*Math.cos(alpha), cylinderRadius*Math.sin(alpha), zOffset-cylinderHeight];
        Array.prototype.push.apply(vertexData, position);
        Array.prototype.push.apply(vertexData, baseNormal);
    }
    for (i = 0; i < levelOfDetail; i++) {
        alpha = 2*Math.PI*i/levelOfDetail;
        position = [cylinderRadius*Math.cos(alpha), cylinderRadius*Math.sin(alpha), zOffset-cylinderHeight];
        normal = [Math.cos(alpha), Math.sin(alpha), 0];
        Array.prototype.push.apply(vertexData, position);
        Array.prototype.push.apply(vertexData, normal);
    }
    for (i = 0; i < levelOfDetail; i++) {
        alpha = 2*Math.PI*i/levelOfDetail;
        position = [cylinderRadius*Math.cos(alpha), cylinderRadius*Math.sin(alpha), zOffset];
        normal = [Math.cos(alpha), Math.sin(alpha), 0];
        Array.prototype.push.apply(vertexData, position);
        Array.prototype.push.apply(vertexData, normal);
    }
    var indices = [];
    var triangleIndices;
    for (i = 0; i < levelOfDetail; i++) {
        triangleIndices = [1+i, 1+(i+1)%levelOfDetail, 0];
        Array.prototype.push.apply(indices, triangleIndices);
    }
    for (i = 0; i < levelOfDetail; i++) {
        triangleIndices = [levelOfDetail+1, levelOfDetail+1+(i+1)%levelOfDetail, levelOfDetail+1+i];
        Array.prototype.push.apply(indices, triangleIndices);
    }
    for (i = 0; i < levelOfDetail; i++) {
        triangleIndices = [levelOfDetail*2+1, levelOfDetail*2+1+(i+1)%levelOfDetail, levelOfDetail*2+1+i];
        Array.prototype.push.apply(indices, triangleIndices);
    }
    for (i = 0; i < levelOfDetail; i++) {
        triangleIndices = [levelOfDetail*3+1+i, levelOfDetail*3+1+(i+1)%levelOfDetail, levelOfDetail*4+1+i];
        Array.prototype.push.apply(indices, triangleIndices);
        triangleIndices = [levelOfDetail*4+1+i, levelOfDetail*3+1+(i+1)%levelOfDetail, levelOfDetail*4+1+(i+1)%levelOfDetail];
        Array.prototype.push.apply(indices, triangleIndices);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexData), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Int16Array(indices), gl.STATIC_DRAW);
    this._numIndices = indices.length;
};

WebGLSpins.prototype._handleMouseDown = function(event) {
    if (!this._options.allowCameraMovement) {
        return;
    }
    this._mouseDown = true;
    this._lastMouseX = event.clientX;
    this._lastMouseY = event.clientY;
};

WebGLSpins.prototype._handleMouseUp = function(event) {
    this._mouseDown = false;
};

WebGLSpins.prototype._handleMouseMove = function(event) {
    if (!this._options.allowCameraMovement) {
        return;
    }
    if (!this._mouseDown) {
      return;
    }
    var newX = event.clientX;
    var newY = event.clientY;
    var deltaX = newX - this._lastMouseX;
    var deltaY = newY - this._lastMouseY;
    if (event.shiftKey) {
        this.zoom(deltaY > 0 ? 1 : -1);
    } else {
        var forwardVector = WebGLSpins._difference(this._options.centerLocation, this._options.cameraLocation);
        var cameraDistance = WebGLSpins._length(forwardVector);
        forwardVector = WebGLSpins._normalize(forwardVector);
        this._options.upVector = WebGLSpins._normalize(this._options.upVector);
        var rightVector = WebGLSpins._cross(forwardVector, this._options.upVector);
        this._options.upVector = WebGLSpins._cross(rightVector, forwardVector);
        this._options.upVector = WebGLSpins._normalize(this._options.upVector);
        if (event.altKey) {
            var translation =  [
                (deltaY / 100 * this._options.upVector[0] - deltaX / 100 * rightVector[0])*cameraDistance*0.1,
                (deltaY / 100 * this._options.upVector[1] - deltaX / 100 * rightVector[1])*cameraDistance*0.1,
                (deltaY / 100 * this._options.upVector[2] - deltaX / 100 * rightVector[2])*cameraDistance*0.1];
            this._options.cameraLocation[0] += translation[0];
            this._options.cameraLocation[1] += translation[1];
            this._options.cameraLocation[2] += translation[2];
            this._options.centerLocation[0] += translation[0];
            this._options.centerLocation[1] += translation[1];
            this._options.centerLocation[2] += translation[2];
        } else {
            var l = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            if (l > 0) {
                var axis = [
                    deltaX / l * this._options.upVector[0] + deltaY / l * rightVector[0],
                    deltaX / l * this._options.upVector[1] + deltaY / l * rightVector[1],
                    deltaX / l * this._options.upVector[2] + deltaY / l * rightVector[2]];
                var rotationMatrix = WebGLSpins._rotationMatrix(axis, -0.1 * l);
                forwardVector = WebGLSpins._matrixMultiply(rotationMatrix, forwardVector);
                this._options.upVector = WebGLSpins._matrixMultiply(rotationMatrix, this._options.upVector);
                this._options.cameraLocation[0] = this._options.centerLocation[0] - cameraDistance * forwardVector[0];
                this._options.cameraLocation[1] = this._options.centerLocation[1] - cameraDistance * forwardVector[1];
                this._options.cameraLocation[2] = this._options.centerLocation[2] - cameraDistance * forwardVector[2];
            }
        }
    }
    this._lastMouseX = newX;
    this._lastMouseY = newY;
    this.draw();
};

WebGLSpins.prototype._handleMouseScroll = function(event) {
    if (!this._options.allowCameraMovement) {
        return;
    }
    var delta = Math.max(-1, Math.min(1, (event.wheelDelta || -event.detail)));
    this.zoom(delta);
};

WebGLSpins.prototype.zoom = function(delta) {
    if (!this._options.allowCameraMovement) {
        return;
    }
    var forwardVector = WebGLSpins._difference(this._options.centerLocation, this._options.cameraLocation);
    var cameraDistance = WebGLSpins._length(forwardVector);
    if (cameraDistance < 2 && delta < 1) {
        return;
    }
    this._options.cameraLocation[0] = this._options.centerLocation[0] - (1+0.02*delta) * forwardVector[0];
    this._options.cameraLocation[1] = this._options.centerLocation[1] - (1+0.02*delta) * forwardVector[1];
    this._options.cameraLocation[2] = this._options.centerLocation[2] - (1+0.02*delta) * forwardVector[2];
    this.draw();
}

WebGLSpins._difference = function(a, b) {
    return [
        a[0]-b[0],
        a[1]-b[1],
        a[2]-b[2]
    ];
};

WebGLSpins._length = function(a) {
    return Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]);
};

WebGLSpins._normalize = function(a) {
    var length = WebGLSpins._length(a);
    return [a[0]/length, a[1]/length, a[2]/length];
};

WebGLSpins._cross = function(a, b) {
    return [
        a[1]*b[2]-a[2]*b[1],
        a[2]*b[0]-a[0]*b[2],
        a[0]*b[1]-a[1]*b[0]
    ];
};

WebGLSpins._rotationMatrix = function(axis, angle) {
    var c = Math.cos(Math.PI * angle / 180);
    var s = Math.sin(Math.PI * angle / 180);
    var x = axis[0];
    var y = axis[1];
    var z = axis[2];
    return [
        [x*x*(1-c)+c, x*y*(1-c)-z*s, x*z*(1-c)+y*s, 0],
        [x*y*(1-c)+z*s, y*y*(1-c)+c, z*y*(1-c)-x*s, 0],
        [x*z*(1-c)-y*s, z*y*(1-c)+x*s, z*z*(1-c)+c,0],
        [0, 0, 0, 1]
    ];
};

WebGLSpins._matrixMultiply = function(matrix, vector) {
    var result = [0, 0, 0];
    for(var i = 0; i < 3; i++) {
        for(var j = 0; j < 3; j++) {
            result[i] += matrix[i][j]*vector[j];
        }
        result[i] += matrix[i][3];
    }
    return result;
};

WebGLSpins._perspectiveProjectionMatrix = function(verticalFieldOfView, aspectRatio, zNear, zFar) {
    var f = 1.0/Math.tan(verticalFieldOfView/2);
    return [
        [f/aspectRatio, 0, 0, 0],
        [0, f, 0, 0],
        [0, 0, (zNear+zFar)/(zNear-zFar), 2*zFar*zNear/(zNear-zFar)],
        [0, 0, -1, 0]
    ]
};

WebGLSpins._lookAtMatrix = function(cameraLocation, centerLocation, upVector) {
    var forwardVector = WebGLSpins._difference(centerLocation, cameraLocation);
    forwardVector = WebGLSpins._normalize(forwardVector);
    upVector = WebGLSpins._normalize(upVector);
    var rightVector = WebGLSpins._cross(forwardVector, upVector);
    rightVector = WebGLSpins._normalize(rightVector);
    upVector = WebGLSpins._cross(rightVector, forwardVector);
    var matrix = [
        [rightVector[0], rightVector[1], rightVector[2], 0],
        [upVector[0], upVector[1], upVector[2], 0],
        [-forwardVector[0], -forwardVector[1], -forwardVector[2], 0],
        [0, 0, 0, 1]
    ];
    var translationVector = WebGLSpins._matrixMultiply(matrix, cameraLocation);
    matrix[0][3] = -translationVector[0];
    matrix[1][3] = -translationVector[1];
    matrix[2][3] = -translationVector[2];
    return matrix;
};

WebGLSpins._toFloat32Array = function(matrix) {
    return new Float32Array([
        matrix[0][0], matrix[1][0], matrix[2][0], matrix[3][0],
        matrix[0][1], matrix[1][1], matrix[2][1], matrix[3][1],
        matrix[0][2], matrix[1][2], matrix[2][2], matrix[3][2],
        matrix[0][3], matrix[1][3], matrix[2][3], matrix[3][3]
    ]);
};