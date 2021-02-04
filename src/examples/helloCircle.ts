import glslangModule from '../glslang';

export const title = 'Hello Circle';
export const description = `渲染一个边界平滑的圆，本示例主要练习WebGPU中Uniform定义与在着色器使用，
以及WGSL中使用builtin内置变量方法，if/elseif/else逻辑控制，+-运算符以及类型强转，以及mix,distance,smoonStep等内建函数使用`;

export async function init(canvas: HTMLCanvasElement, useWGSL: boolean) {
  //获取显卡适配器
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance'
  });
  //获取设备
  const device = await adapter.requestDevice();
  //该模块用于将glsl转spir_v
  const glslang = await glslangModule();
  //获取gpu交互上下文
  const context = canvas.getContext("gpupresent");
  // 交换链，用于显卡往显示器输出图像
  const swapChainFormat = "bgra8unorm";
  const swapChain = context.configureSwapChain({
    device,
    format: swapChainFormat,
  });

  //圆心与半径
  const circleCenter = [300, 300];
  const circleRadius = 200;
  //根据圆心半径生成一个 矩形(2个三角形组成)
  const vertexData = [
    circleCenter[0] - circleRadius, circleCenter[1] - circleRadius,
    circleCenter[0] - circleRadius, circleCenter[1] + circleRadius,
    circleCenter[0] + circleRadius, circleCenter[1] + circleRadius,

    circleCenter[0] + circleRadius, circleCenter[1] + circleRadius,
    circleCenter[0] + circleRadius, circleCenter[1] - circleRadius,
    circleCenter[0] - circleRadius, circleCenter[1] - circleRadius
  ];

  //绘制顶点数据
  const vertexArray = new Float32Array(vertexData);
  const verticesBuffer = device.createBuffer({
    size: vertexArray.byteLength,
    usage: GPUBufferUsage.VERTEX,//声明buffer用途，作用于顶点着色器
    mappedAtCreation: true,
  });
  new Float32Array(verticesBuffer.getMappedRange()).set(vertexArray);
  verticesBuffer.unmap();

  //创建三个uniform，用于像素坐标转裁剪坐标
  const bounds = new Float32Array([600, 600]);
  const boundsBuffer = device.createBuffer({
    size: bounds.byteLength,
    usage: GPUBufferUsage.UNIFORM,//声明buffer用途，作用于uniform
    mappedAtCreation: true,
  });
  new Float32Array(boundsBuffer.getMappedRange()).set(bounds);
  boundsBuffer.unmap();

  const circle = new Float32Array([circleCenter[0], circleCenter[1], circleRadius]);
  const circleBuffer = device.createBuffer({
    size: circle.byteLength,
    usage: GPUBufferUsage.UNIFORM,//声明buffer用途，作用于uniform
    mappedAtCreation: true,
  });
  new Float32Array(circleBuffer.getMappedRange()).set(circle);
  circleBuffer.unmap();



  //创建UniformGroupLayout
  const uniformGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        type: 'uniform-buffer'
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        type: 'uniform-buffer'
      }
    ]
  });

  


  //渲染管线
  const pipeline = device.createRenderPipeline({
    layout:device.createPipelineLayout( {
      bindGroupLayouts: [ uniformGroupLayout ]
    }),
    vertexStage: {
      module: useWGSL
        ? device.createShaderModule({
          code: wgslShaders.vertex,
        })
        : device.createShaderModule({
          code: glslShaders.vertex,
          transform: (glsl) => glslang.compileGLSL(glsl, "vertex"),
        }),
      entryPoint: "main",
    },
    fragmentStage: {
      module: useWGSL
        ? device.createShaderModule({
          code: wgslShaders.fragment,
        })
        : device.createShaderModule({
          code: glslShaders.fragment,
          transform: (glsl) => glslang.compileGLSL(glsl, "fragment"),
        }),
      entryPoint: "main",
    },
    // 绘制模式
    /*
    enum GPUPrimitiveTopology {
      "point-list",
      "line-list",
      "line-strip",
      "triangle-list",
      "triangle-strip"
    };

    */
    primitiveTopology: "triangle-list",
    vertexState: {
      vertexBuffers: [
        {
          /*步进值，也就是每个顶点需要占用几个储存空间，单位是 byte。
          我们是用 Float32Array 来储存顶点位置的，每个 32 位浮点数需要 4 个 byte；
          xyz三维顶点需要 3 个 32 位浮点数来分别表示，即 4 * 3 byte。
          xy二维顶点需要2个32 位浮点数来分别表示，即 4 * 2 个 byte。
          */
          arrayStride: 4 * 2,
          attributes: [
            {
              // position
              //对应顶点着色器中 layout(location = 0)
              shaderLocation: 0,
              //0代表从头开始
              offset: 0,
              //2个32位浮点数，float3代表3个浮点数
              format: "float2",
            }
          ],
        },
      ],
    },
    colorStates: [
      {
        format: swapChainFormat,
      },
    ],
    //vertexState 设定用于顶点缓存的一些描述信息，例如格式、长度、位移等
    //layout 用于将 CPU 端的资源，也就是 JavaScript 中的资源，绑定到 GPU 端的
  });


  const uniformBindGroup = device.createBindGroup({
    layout: uniformGroupLayout,
    entries: [{
      binding: 0,
      resource: { buffer: boundsBuffer }
    },
    {
      binding: 1,
      resource: { buffer: circleBuffer }
    }]
  });

  function frame() {
    const commandEncoder = device.createCommandEncoder();
    // 获取当前纹理图像
    const textureView = swapChain.getCurrentTexture().createView();

    // 渲染通道描述
    const renderPassDescriptor: GPURenderPassDescriptor = {
      // 存储图像信息
      colorAttachments: [
        {
          // 指定存储图像的位置
          attachment: textureView,
          // 背景颜色
          loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          // storeOp 存储选型  store 或 clear
          // resolveTarget 多重采样
        },
      ],
    };

    //开启一个渲染通道
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    //默认会开启一个视口viewport，宽高就是canvas的width height而不是clientwidth,clientheight
    //设置 渲染管线
    passEncoder.setPipeline(pipeline);
    //设置顶点
    passEncoder.setVertexBuffer(0, verticesBuffer);
    //设置uniform
    passEncoder.setBindGroup(0, uniformBindGroup );
  

    passEncoder.draw(vertexData.length, 1, 0, 0);
    passEncoder.endPass();

    device.queue.submit([commandEncoder.finish()]);
  }

  return frame;
}

export const glslShaders = {
  vertex: `#version 450
  layout(location = 0) in vec2 a_position;
  layout(set = 0, binding = 0) uniform Uniforms {
    vec2 bounds;
  } uniforms;
  void main() {
    vec2 zeroToOne = a_position/uniforms.bounds;
    vec2 oneToTwe = zeroToOne*2.0;
    vec2 clipSpace = oneToTwe-1.0;
    gl_Position = vec4(clipSpace, 0.0, 1.0);
  }
`,

  fragment: `#version 450
  layout(set = 0, binding = 1) uniform Uniforms {
    vec3 circle;
  } uniforms;

  layout(location = 0) out vec4 outColor;
  void main() {
      float dis = distance(gl_FragCoord.xy,uniforms.circle.xy);
      if(dis<uniforms.circle.z-3.0){
        outColor=vec4(1.0,0.0,0.0,1.0);
      }
      else if(dis<=uniforms.circle.z){
        float step=smoothstep(uniforms.circle.z-3.0,uniforms.circle.z,dis);
        outColor=mix(vec4(1.0,0.0,0.0,1.0), vec4(0.0,0.0,0.0,1.0), step);
      }
      else{
        outColor=vec4(0.0,0.0,0.0,1.0);
      }
  }
`,
};

export const wgslShaders = {
  vertex: `
  [[block]] struct Uniforms {
    [[offset(0)]] bounds : vec2<f32>;
  };
  [[binding(0), set(0)]] var<uniform> uniforms : Uniforms;

  [[location(0)]] var<in> a_position : vec2<f32>;
  [[builtin(position)]] var<out> Position : vec4<f32>;

  [[stage(vertex)]]
  fn main() -> void {
    var zeroToOne:vec2<f32> = a_position/uniforms.bounds;
    var oneToTwe:vec2<f32> = zeroToOne*vec2<f32>(2.0,2.0);
    var clipSpace:vec2<f32> = oneToTwe-vec2<f32>(1.0,1.0);
    Position = vec4<f32>(clipSpace, 0.0, 1.0);
    return;
  }
`,
  fragment: `
  [[block]] struct Uniforms {
    [[offset(0)]] circle : vec3<f32>;
  };
  [[binding(1), set(0)]] var<uniform> uniforms : Uniforms;

  // 内置变量，等于glsl的gl_fragcoord，必须在此声明使用
  [[builtin(frag_coord)]] var<in> coord : vec4<f32>;



  // 定义输出变量
  [[location(0)]] var<out> outColor : vec4<f32>;
  [[stage(fragment)]]
  fn main() -> void {
    var dis:f32= distance(coord.xy,uniforms.circle.xy);
    // 由于强类型转换问题，直接用uniforms.circle.z-3.0报错
    // 必须使用类型强转，+-等表达式只能在同类型之间应用。
    var solid:f32 = uniforms.circle.z-f32(3);
    if (dis<solid) {
      outColor=vec4<f32>(1.0,0.0,0.0,1.0);
    }
    elseif(dis<=uniforms.circle.z){
      // 注意函数大小写与glsl忽略大小写不同，函数入参类型要严格与规范文档一致，且vec类型不能简写，必须全量赋值。
      var step:f32=smoothStep(solid,uniforms.circle.z,dis);
      outColor=mix(vec4<f32>(1.0,0.0,0.0,1.0), vec4<f32>(0.0,0.0,0.0,1.0), vec4<f32>(step,step,step,step));
    }
    else {
      outColor=vec4<f32>(0.0,0.0,0.0,1.0);
    }
    return;
  }`
};
