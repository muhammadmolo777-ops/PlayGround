import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js';

const container=document.querySelector('#game');
const scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(0xc0d9cf,.0125);
const camera=new THREE.PerspectiveCamera(73,innerWidth/innerHeight,.1,500);
camera.rotation.order='YXZ';
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;container.appendChild(renderer.domElement);

const clock=new THREE.Clock();const world={seed:719,blocks:0};
const mat=(color,roughness=1,extra={})=>new THREE.MeshStandardMaterial({color,roughness,...extra});
const mats={grass:mat(0x779775),dirt:mat(0x80674e),wood:mat(0x72523c),leaf:mat(0x64856a),leafLight:mat(0x89a578),stone:mat(0x929589),sand:mat(0xc7b68e),darkwood:mat(0x493c32)};
scene.background=new THREE.Color(0xc0d9cf);
const hemi=new THREE.HemisphereLight(0xd9f0e5,0x646859,1.65);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffd49a,3.2);sun.position.set(-32,48,20);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-55;sun.shadow.camera.right=55;sun.shadow.camera.top=55;sun.shadow.camera.bottom=-55;sun.shadow.bias=-.0002;scene.add(sun);sun.target.position.set(0,0,0);scene.add(sun.target);
const fill=new THREE.DirectionalLight(0xc4e4df,.55);fill.position.set(25,18,-20);scene.add(fill);

// A soft procedural sky, sunset glow, and fine cloud wisps.
const sky=new THREE.Mesh(new THREE.SphereGeometry(300,32,20),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,vertexShader:`varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vPos; void main(){float h=normalize(vPos).y;vec3 top=vec3(.31,.53,.57);vec3 mid=vec3(.74,.82,.75);vec3 low=vec3(.98,.72,.48);float k=smoothstep(-.25,.72,h);vec3 c=mix(low,mid,smoothstep(-.34,.08,h));c=mix(c,top,k);float cloud=sin(vPos.x*.027+sin(vPos.z*.014)*2.)*sin(vPos.z*.032+vPos.x*.009);float band=smoothstep(.35,.68,cloud)*smoothstep(.15,.55,h);c=mix(c,vec3(.93,.83,.68),band*.17);gl_FragColor=vec4(c,1.);}` }));scene.add(sky);
const sunBall=new THREE.Mesh(new THREE.SphereGeometry(2.1,24,16),new THREE.MeshBasicMaterial({color:0xffe6b1}));sunBall.position.set(-44,28,-95);scene.add(sunBall);
const sunGlow=new THREE.Mesh(new THREE.SphereGeometry(5.2,24,16),new THREE.MeshBasicMaterial({color:0xf8cb8f,transparent:true,opacity:.18,depthWrite:false}));sunGlow.position.copy(sunBall.position);scene.add(sunGlow);

function hash(x,z){let n=Math.sin(x*127.1+z*311.7+world.seed*74.7)*43758.5453;return n-Math.floor(n)}
function smoothNoise(x,z){const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;const u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iz),hash(ix+1,iz),u),THREE.MathUtils.lerp(hash(ix,iz+1),hash(ix+1,iz+1),u),v)}
function lakeAt(x,z){return (x/10.7)**2+((z+1)/11.5)**2<1}
function heightAt(x,z){const d=Math.sqrt((x*.92)**2+(z*.94)**2);const hills=Math.max(0,d-12)*.27+Math.sin(x*.19+z*.13)*.75+Math.sin(z*.31-x*.22)*.35+(smoothNoise(x*.11,z*.11)-.5)*1.5;return Math.max(1,Math.floor(1+hills))}
const groundGeo=new THREE.BoxGeometry(1,1,1);
const grassInstances=[],dirtInstances=[],topCoords=[],dirtCoords=[];
for(let x=-32;x<=32;x++)for(let z=-32;z<=32;z++){
 if(lakeAt(x,z))continue;
 const h=heightAt(x,z);
 for(let y=-2;y<h-1;y++)dirtInstances.push({x,y:y+.5,z,key:`${x},${z},${y}`});
 grassInstances.push({x,y:h-.5,z,key:`${x},${z},${h-1}`});
}
function makeInstanced(list,material,palette){const mesh=new THREE.InstancedMesh(groundGeo,material,list.length);mesh.castShadow=false;mesh.receiveShadow=true;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);const dummy=new THREE.Object3D();list.forEach((v,i)=>{dummy.position.set(v.x,v.y,v.z);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(palette){const shade=.82+hash(v.x,v.z)*.32;mesh.setColorAt(i,new THREE.Color(palette).multiplyScalar(shade));}});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;scene.add(mesh);return mesh}
const grassMesh=makeInstanced(grassInstances,mats.grass,0xffffff);const dirtMesh=makeInstanced(dirtInstances,mats.dirt,0xffffff);
const topLookup=new Map(grassInstances.map((v,i)=>[`${v.x},${v.z}`,i]));
const removed=new Set();const exposed=[];let exposedMesh=null;

// Shimmering lake shader: gentle wind bands, sunlit highlights and deep teal edges.
const waterUniforms={uTime:{value:0},uSun:{value:new THREE.Vector3(-.6,.7,.35)}};
const waterMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:waterUniforms,vertexShader:`uniform float uTime; varying vec3 vWorld; varying vec3 vNormal; void main(){vec3 p=position;float w=sin(p.x*.62+uTime*.68)*.055+sin(p.y*.51-uTime*.47)*.045+sin((p.x+p.y)*.19+uTime*.3)*.035;p.z+=w;vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;vNormal=normalize(mat3(modelMatrix)*vec3(-.03*cos(p.x*.62+uTime*.68),-.025*cos(p.y*.51-uTime*.47),1.));gl_Position=projectionMatrix*viewMatrix*world;}`,fragmentShader:`uniform float uTime;uniform vec3 uSun;varying vec3 vWorld;varying vec3 vNormal;void main(){vec3 n=normalize(vNormal);float view=pow(1.-max(dot(n,normalize(cameraPosition-vWorld)),0.),3.);float ripple=sin(vWorld.x*2.7+vWorld.z*1.6+uTime*.82)*sin(vWorld.z*2.25-uTime*.56);float glint=smoothstep(.91,.995,ripple+max(dot(n,normalize(uSun)),0.)*.2);vec3 deep=vec3(.12,.34,.36);vec3 shallow=vec3(.38,.60,.55);vec3 c=mix(deep,shallow,smoothstep(0.,8.,length(vWorld.xz)));c=mix(c,vec3(.84,.80,.62),glint*.65);c=mix(c,vec3(.69,.80,.72),view*.5);gl_FragColor=vec4(c,.86);}`});
const water=new THREE.Mesh(new THREE.PlaneGeometry(22.8,24.5,120,120),waterMat);water.rotation.x=-Math.PI/2;water.position.set(0,.18,-1);water.receiveShadow=true;scene.add(water);

const cubeGeo=new THREE.BoxGeometry(1,1,1);const trees=[];const solidMeshes=[];const addCube=(x,y,z,material,scale=1,cast=true)=>{const m=new THREE.Mesh(cubeGeo,material);m.position.set(x,y,z);m.scale.setScalar(scale);m.castShadow=cast;m.receiveShadow=true;scene.add(m);solidMeshes.push(m);return m};
function tree(x,z,type='broadleaf'){
 const ground=heightAt(x,z),trunkH=type==='pine'?4+Math.floor(hash(x,z)*2):3+Math.floor(hash(z,x)*2);
 for(let y=0;y<trunkH;y++)addCube(x,ground+y+.5,z,mats.wood,1);
 if(type==='pine'){
  for(let layer=0;layer<4;layer++){const r=2-Math.floor(layer/2);for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)if(Math.abs(dx)+Math.abs(dz)<=r+1&&hash(x+dx*3+layer,z+dz*2)>.12)addCube(x+dx,ground+trunkH-1+layer,z+dz,layer%2?mats.leaf:mats.leafLight,1,false);}
 }else{
  const cy=ground+trunkH;
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=-1;dy<=1;dy++)if(dx*dx+dz*dz+dy*dy*1.4<7&&hash(x+dx*8+dy,z+dz*3)>.13)addCube(x+dx,cy+dy,z+dz,hash(x+dx,z+dz)>.5?mats.leaf:mats.leafLight,1,false);
 }
}
// Shelter the far shore with soft, irregular groves and a few darker pines.
for(let x=-29;x<=29;x+=3)for(let z=-28;z<=28;z+=3){if(lakeAt(x,z))continue;const r=Math.sqrt(x*x+z*z);const chance=(r>14&&r<32)?(.15+smoothNoise(x*.2,z*.2)*.34):0;if(hash(x,z)<chance){const tx=x+hash(z,x)*1.7-.85,tz=z+hash(x+6,z)*1.7-.85;tree(tx,tz,hash(x+z,z)>.79?'pine':'broadleaf');}}

// Distant stepped ridges give the lake a tucked-away horizon.
for(let side of [-1,1])for(let i=0;i<34;i++){const x=side*(21+i*.65),z=-35+ i*1.25,base=heightAt(x*.75,z*.75)+1,h=3+Math.floor(hash(i,side)*6);for(let y=0;y<h;y++){const m=addCube(x,base+y,z,y===h-1?mats.leaf:mats.dirt,1,false);m.scale.set(1.7,1,2.1);}}

// Small shoreline stones and flower flecks.
const flowerMats=[mat(0xe5d5a5,.8,{emissive:0x413118,emissiveIntensity:.16}),mat(0xd4a9a0,.8)];
for(let i=0;i<130;i++){const a=hash(i,8)*Math.PI*2,r=12+hash(i,18)*4,x=Math.cos(a)*r,z=Math.sin(a)*r-1;if(lakeAt(x,z))continue;const y=heightAt(x,z);if(hash(i,5)>.68)addCube(Math.round(x),y+.08,Math.round(z),mats.stone,.25,false);else if(hash(i,5)>.38){const f=new THREE.Mesh(new THREE.SphereGeometry(.09,6,5),flowerMats[i%2]);f.position.set(x,y+.12,z);scene.add(f);}}

// Atmospheric motes catch the warm light above the water.
const moteGeo=new THREE.BufferGeometry(),moteCount=180,motePos=new Float32Array(moteCount*3);for(let i=0;i<moteCount;i++){motePos[i*3]=(hash(i,4)-.5)*39;motePos[i*3+1]=.5+hash(i,5)*5;motePos[i*3+2]=(hash(i,6)-.5)*40;}moteGeo.setAttribute('position',new THREE.BufferAttribute(motePos,3));const motes=new THREE.Points(moteGeo,new THREE.PointsMaterial({color:0xffdfaa,size:.055,transparent:true,opacity:.58,depthWrite:false}));scene.add(motes);

const inventory=[{name:'Moss grass',color:'#779775',mat:mats.grass,count:8},{name:'Warm earth',color:'#80674e',mat:mats.dirt,count:16},{name:'River stone',color:'#929589',mat:mats.stone,count:4},{name:'Pine wood',color:'#72523c',mat:mats.wood,count:4},{name:'Canopy',color:'#64856a',mat:mats.leaf,count:4}];let selected=0;
const hotbar=document.querySelector('#hotbar');
function drawHotbar(){hotbar.innerHTML='';inventory.forEach((item,i)=>{const slot=document.createElement('button');slot.className='slot'+(i===selected?' active':'');slot.title=item.name;slot.innerHTML=`<span class="key">${i+1}</span><span class="block-icon" style="background:${item.color}"></span><span class="count">${item.count}</span>`;slot.addEventListener('click',()=>selectBlock(i));hotbar.append(slot);});}
function selectBlock(i){selected=(i+inventory.length)%inventory.length;drawHotbar();}
drawHotbar();
const player={x:0,z:13,y:4.2,yaw:0,pitch:-.08,vy:0,onGround:true};camera.position.set(player.x,4.2,player.z);camera.rotation.set(player.pitch,player.yaw,0,'YXZ');
const keys=new Set();let started=false,locked=false,joystick={x:0,y:0};
function notify(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>el.classList.remove('show'),1700);}
function begin(){started=true;document.querySelector('#intro').classList.add('hidden');if(!('ontouchstart'in window)&&renderer.domElement.requestPointerLock)renderer.domElement.requestPointerLock();}
document.querySelector('#start').addEventListener('click',begin);
document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===renderer.domElement;});
document.addEventListener('mousemove',e=>{if(locked){player.yaw-=e.movementX*.0022;player.pitch=Math.max(-1.25,Math.min(1.25,player.pitch-e.movementY*.0018));}});
document.addEventListener('keydown',e=>{keys.add(e.code);if(e.code.startsWith('Digit'))selectBlock(Number(e.code.slice(5))-1);if(e.code==='Space'){e.preventDefault();if(player.onGround){player.vy=5.1;player.onGround=false;}}});
document.addEventListener('keyup',e=>keys.delete(e.code));
document.addEventListener('contextmenu',e=>e.preventDefault());
renderer.domElement.addEventListener('mousedown',e=>{if(!started)return;if(e.button===0)breakTarget();if(e.button===2)placeBlock();});
function getGround(x,z){if(lakeAt(x,z))return .22;return heightAt(Math.round(x),Math.round(z));}
const raycaster=new THREE.Raycaster();raycaster.far=6;
function targetHit(){raycaster.setFromCamera(new THREE.Vector2(0,0),camera);const candidates=[grassMesh,dirtMesh,...solidMeshes,...placedMeshes];return raycaster.intersectObjects(candidates,false)[0]||null;}
let placedMeshes=[];let placedKeys=new Set();
function breakTarget(){if(!started)return;const hit=targetHit();if(!hit){notify('Nothing within reach');return;}if(hit.object===grassMesh){const item=grassInstances[hit.instanceId];const dummy=new THREE.Object3D();dummy.position.set(item.x,item.y,item.z);dummy.scale.setScalar(0);dummy.updateMatrix();grassMesh.setMatrixAt(hit.instanceId,dummy.matrix);grassMesh.instanceMatrix.needsUpdate=true;removed.add(item.key);const patch=addCube(item.x,item.y,item.z,mats.dirt,1,false);patch.userData.kind='patch';exposed.push(patch);inventory[0].count++;world.blocks++;}
 else if(hit.object===dirtMesh){const item=dirtInstances[hit.instanceId];const dummy=new THREE.Object3D();dummy.position.set(item.x,item.y,item.z);dummy.scale.setScalar(0);dummy.updateMatrix();dirtMesh.setMatrixAt(hit.instanceId,dummy.matrix);dirtMesh.instanceMatrix.needsUpdate=true;inventory[1].count++;world.blocks++;}
 else{const obj=hit.object;if(obj.userData.placed){placedKeys.delete(obj.userData.gridKey);placedMeshes=placedMeshes.filter(x=>x!==obj);scene.remove(obj);inventory[obj.userData.kind].count++;world.blocks++;}else if(solidMeshes.includes(obj)){scene.remove(obj);solidMeshes.splice(solidMeshes.indexOf(obj),1);inventory[3].count++;world.blocks++;}else return;}
 document.querySelector('#count').innerHTML=`✦ &nbsp;${world.blocks} blocks`;drawHotbar();}
function placeBlock(){if(!started)return;const item=inventory[selected];if(item.count<=0){notify('No '+item.name.toLowerCase()+' left');return;}const hit=targetHit();if(!hit){notify('Look at a block to build');return;}const n=hit.face?.normal||new THREE.Vector3(0,1,0);const p=hit.point.clone().addScaledVector(n,.52);const x=Math.round(p.x),z=Math.round(p.z),y=Math.floor(p.y)+.5,key=`${x},${Math.floor(y)},${z}`;if(placedKeys.has(key)){notify('That space is occupied');return;}const cube=new THREE.Mesh(cubeGeo,item.mat);cube.position.set(x,y,z);cube.castShadow=true;cube.receiveShadow=true;cube.userData={placed:true,gridKey:key,kind:selected};scene.add(cube);placedMeshes.push(cube);placedKeys.add(key);item.count--;drawHotbar();}
document.querySelector('#sound').addEventListener('click',()=>notify('The world is quiet for now'));
document.querySelector('#breakBtn').addEventListener('pointerdown',e=>{e.preventDefault();breakTarget();});document.querySelector('#placeBtn').addEventListener('pointerdown',e=>{e.preventDefault();placeBlock();});document.querySelector('#jumpBtn').addEventListener('pointerdown',e=>{e.preventDefault();if(player.onGround){player.vy=5.1;player.onGround=false;}});

// Thumb joystick and right-side drag look for phones and tablets.
const stick=document.querySelector('#stick'),knob=document.querySelector('#knob');let stickId=null,lookId=null,lastLook={x:0,y:0};
stick.addEventListener('pointerdown',e=>{stickId=e.pointerId;stick.setPointerCapture(stickId);moveStick(e);});
stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId)moveStick(e);});
function moveStick(e){const r=stick.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),lim=r.width*.34,len=Math.hypot(dx,dy)||1,m=Math.min(lim,len);joystick.x=dx/len*m/lim;joystick.y=dy/len*m/lim;knob.style.transform=`translate(calc(-50% + ${joystick.x*lim}px),calc(-50% + ${joystick.y*lim}px))`;}
function releaseStick(e){if(e.pointerId!==stickId)return;stickId=null;joystick={x:0,y:0};knob.style.transform='translate(-50%,-50%)';}stick.addEventListener('pointerup',releaseStick);stick.addEventListener('pointercancel',releaseStick);
const lookZone=document.querySelector('#lookZone');lookZone.addEventListener('pointerdown',e=>{lookId=e.pointerId;lastLook={x:e.clientX,y:e.clientY};lookZone.setPointerCapture(lookId);});lookZone.addEventListener('pointermove',e=>{if(e.pointerId!==lookId)return;player.yaw-=(e.clientX-lastLook.x)*.006;player.pitch=Math.max(-1.18,Math.min(1.18,player.pitch-(e.clientY-lastLook.y)*.005));lastLook={x:e.clientX,y:e.clientY};});lookZone.addEventListener('pointerup',e=>{if(e.pointerId===lookId)lookId=null;});lookZone.addEventListener('pointercancel',e=>{if(e.pointerId===lookId)lookId=null;});

let elapsed=0;
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.04);elapsed+=dt;waterUniforms.uTime.value=elapsed;
 if(started){const forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'))-joystick.y;const side=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'))+joystick.x;const len=Math.hypot(forward,side)||1;const speed=keys.has('ShiftLeft')?7:4.7;const fx=Math.sin(player.yaw),fz=-Math.cos(player.yaw),rx=Math.cos(player.yaw),rz=Math.sin(player.yaw);player.x+=(fx*forward/len+rx*side/len)*speed*dt;player.z+=(fz*forward/len+rz*side/len)*speed*dt;player.x=THREE.MathUtils.clamp(player.x,-34,34);player.z=THREE.MathUtils.clamp(player.z,-37,37);
  const floor=getGround(player.x,player.z)+1.62;if(player.y<=floor+.03){player.y=floor;player.vy=0;player.onGround=true;}else{player.vy-=13*dt;player.y+=player.vy*dt;if(player.y<floor){player.y=floor;player.vy=0;player.onGround=true;}}
  camera.position.set(player.x,player.y,player.z);camera.rotation.set(player.pitch,player.yaw,0,'YXZ');
  const cx=Math.round(player.x),cz=Math.round(player.z);document.querySelector('#coords').textContent=`Lake shore · ${cx}, ${cz}`;
 }
 const p=moteGeo.attributes.position;for(let i=0;i<moteCount;i++){p.array[i*3+1]+=.15*dt*Math.sin(elapsed*.7+i);if(p.array[i*3+1]>7)p.array[i*3+1]=.5;}p.needsUpdate=true;
 renderer.render(scene,camera);
}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));});
window.addEventListener('blur',()=>keys.clear());
animate();
