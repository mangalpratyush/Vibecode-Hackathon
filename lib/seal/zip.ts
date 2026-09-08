/** Stored ZIP entries preserve the exact sealed bytes. */
export function zipFiles(files:{name:string;bytes:Buffer}[]):Buffer {
 const locals:Buffer[]=[],central:Buffer[]=[];let offset=0;
 function crc32(bytes:Buffer){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
 for(const f of files){const name=Buffer.from(f.name),crc=crc32(f.bytes),h=Buffer.alloc(30);
 h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(33,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(f.bytes.length,18);h.writeUInt32LE(f.bytes.length,22);h.writeUInt16LE(name.length,26);locals.push(h,name,f.bytes);
 const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(33,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(f.bytes.length,20);c.writeUInt32LE(f.bytes.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);offset+=h.length+name.length+f.bytes.length;
 }const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,cd,end]);
}
