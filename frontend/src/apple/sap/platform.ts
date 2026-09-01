// Platform services for the SAP guest.
//
// Ported from ipatool's internal/sap/machine/shim_platform.go. The guest is a
// 2013 CommerceKit that expects macOS underneath it: CoreFoundation, IOKit,
// dlopen, a filesystem. None of that exists here, so each import answers with
// the least the signing path needs — usually a constant, sometimes a fake
// handle the guest only ever passes back to another shim.
//
// The one import that carries real data is _read, which streams CoreFP.icxs
// after the guest opens it by its relative path.

import type { Engine } from "./engine";
import type { Shims } from "./shims";

const FAKE_HANDLE = (1n << 64n) - 1n;
const UINT32_MAX = 0xffffffffn;
const MINUS_ONE = (1n << 64n) - 1n;

const CORE_FP_FILE = 3n;
const CORE_FP_PATH = "/System/Library/PrivateFrameworks/CoreFP.framework/CoreFP";
const ICXS_PATH = "./../CoreFP.icxs";

const KEY_SERIAL = "IOPlatformSerialNumber";
const KEY_UUID = "IOPlatformUUID";
const KEY_BOARD = "board-id";
const KEYED_MESSAGE = "objectForKey:";

export function registerPlatformServices(
  shims: Shims,
  engine: Engine,
  coreExports: Map<string, bigint>,
  icxs: Uint8Array,
): void {
  // Guest state that outlives a single call.
  let iterator = 0;
  let icxsOffset = 0;

  const returnZero = () => shims.setResult(0n);
  const returnFakeHandle = () => shims.setResult(FAKE_HANDLE);
  const returnMinusOne = () => shims.setResult(MINUS_ONE);

  shims.addAliases(
    [
      "_CFBundleGetMainBundle",
      "_CFDataGetBytePtr",
      "_CFDataGetLength",
      "_CFStringGetLength",
      "_CFStringGetMaximumSizeForEncoding",
      "_CFUUIDCreateString",
      "_IORegistryEntryFromPath",
      "_IORegistryEntrySearchCFProperty",
      "_IOServiceMatching",
      "_getenv",
      "_pthread_self",
    ],
    returnZero,
  );

  shims.addAliases(
    [
      "_CFDictionaryGetValue",
      "_DADiskCopyDescription",
      "_DADiskCreateFromBSDName",
      "_DASessionCreate",
      "_IORegistryEntryCreateCFProperty",
    ],
    returnFakeHandle,
  );

  shims.addAliases(
    [
      "_CFRelease",
      "_IOObjectRelease",
      "_close",
      "_close$UNIX2003",
      "_pthread_mutex_lock",
      "_pthread_mutex_unlock",
      "_pthread_rwlock_init",
      "_pthread_rwlock_init$UNIX2003",
      "_pthread_rwlock_unlock",
      "_pthread_rwlock_unlock$UNIX2003",
      "_pthread_rwlock_wrlock",
      "_pthread_rwlock_wrlock$UNIX2003",
    ],
    returnZero,
  );

  // Only the three hardware keys need to look real; everything else the guest
  // asks CoreFoundation for can come back null.
  shims.addAliases(["_CFStringCreateWithCString"], () => {
    const value = shims.readCString(shims.argument(1));
    const known = value === KEY_SERIAL || value === KEY_UUID || value === KEY_BOARD;
    shims.setResult(known ? FAKE_HANDLE : 0n);
  });

  shims.addAliases(["_CFStringCreateWithCStringNoCopy"], returnZero);

  shims.addAliases(["_CFStringGetCString"], () => {
    const buffer = shims.argument(1);
    const capacity = shims.argument(2);
    if (buffer === 0n || capacity === 0n) {
      shims.setResult(0n);
      return;
    }
    engine.memWrite(buffer, new Uint8Array([0]));
    shims.setResult(1n);
  });

  // The guest walks an IOKit iterator; yielding one entry then zero ends it.
  shims.addAliases(["_IOIteratorNext"], () => {
    iterator++;
    shims.setResult(BigInt(iterator % 2));
  });

  shims.addAliases(["_IORegistryEntryGetParentEntry"], () => {
    const parent = shims.argument(2);
    if (parent === 0n) throw new Error("parent registry entry output is null");
    engine.writeUint32(parent, Number(UINT32_MAX));
    shims.setResult(0n);
  });

  shims.addAliases(["_IOServiceGetMatchingServices"], () => {
    const output = shims.argument(2);
    if (output === 0n) throw new Error("matching services iterator output is null");
    iterator = 0;
    engine.writeUint32(output, Number(UINT32_MAX));
    shims.setResult(0n);
  });

  shims.addAliases(["_IOServiceGetMatchingService"], () => shims.setResult(UINT32_MAX));

  shims.addAliases(["_OSAtomicCompareAndSwap32Barrier"], () => {
    const oldValue = Number(shims.argument(0) & UINT32_MAX);
    const newValue = Number(shims.argument(1) & UINT32_MAX);
    const address = shims.argument(2);

    if (engine.readUint32(address) !== oldValue) {
      shims.setResult(0n);
      return;
    }
    engine.writeUint32(address, newValue);
    shims.setResult(1n);
  });

  shims.addAliases(["_abort", "___stack_chk_fail", "dyld_stub_binder"], () => {
    throw new Error("guest aborted");
  });

  shims.addAliases(["_arc4random"], () => {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    shims.setResult(BigInt(value[0]));
  });

  shims.addAliases(["_dlopen"], () => {
    const path = shims.readCString(shims.argument(0));
    shims.setResult(path === CORE_FP_PATH ? FAKE_HANDLE : 0n);
  });

  // The guest resolves CoreFP's own exports through dlsym; hand back the
  // addresses the loader already resolved.
  shims.addAliases(["_dlsym"], () => {
    const name = shims.readCString(shims.argument(1));
    shims.setResult(coreExports.get(`_${name}`) ?? 0n);
  });

  shims.addAliases(
    ["_fcntl", "_fcntl$UNIX2003", "_lstat$INODE64", "_statfs", "_statfs$INODE64"],
    returnMinusOne,
  );

  shims.addAliases(["_gettimeofday"], () => {
    const timeAddress = shims.argument(0);
    const zoneAddress = shims.argument(1);
    const now = Date.now();

    if (timeAddress !== 0n) {
      const value = new Uint8Array(16);
      const view = new DataView(value.buffer);
      view.setBigUint64(0, BigInt(Math.floor(now / 1000)), true);
      view.setUint32(8, (now % 1000) * 1000, true);
      engine.memWrite(timeAddress, value);
    }

    if (zoneAddress !== 0n) engine.memZero(zoneAddress, 8);
    shims.setResult(0n);
  });

  shims.addAliases(["_objc_msgSend"], () => {
    const selector = shims.readCString(shims.argument(1));
    shims.setResult(selector === KEYED_MESSAGE ? FAKE_HANDLE : 0n);
  });

  shims.addAliases(["_open", "_open$UNIX2003"], () => {
    const path = shims.readCString(shims.argument(0));
    if (path !== ICXS_PATH) {
      returnMinusOne();
      return;
    }
    icxsOffset = 0;
    shims.setResult(CORE_FP_FILE);
  });

  // pthread_once has to actually run the initializer, so push it as a return
  // address and let the guest fall into it when this shim's RET executes.
  shims.addAliases(["_pthread_once"], () => {
    const control = shims.argument(0);
    const initializer = shims.argument(1);

    if (engine.readUint64(control) === 0n) {
      shims.setResult(0n);
      return;
    }

    engine.writeUint64(control, 0n);

    const stack = engine.regRead(engine.regRSP) - 8n;
    engine.writeUint64(stack, initializer);
    engine.regWrite(engine.regRSP, stack);
    shims.setResult(0n);
  });

  shims.addAliases(["_read", "_read$UNIX2003"], () => {
    const descriptor = shims.argument(0);
    const buffer = shims.argument(1);
    const requested = shims.argument(2);

    if (descriptor !== CORE_FP_FILE) {
      returnMinusOne();
      return;
    }

    let size = Number(requested);
    const remaining = icxs.length - icxsOffset;
    if (size > remaining) size = remaining;

    if (size !== 0) {
      engine.memWrite(buffer, icxs.subarray(icxsOffset, icxsOffset + size));
      icxsOffset += size;
    }

    shims.setResult(BigInt(size));
  });

  shims.addAliases(["_sysctl"], returnMinusOne);

  shims.addAliases(["_sysctlbyname"], () => {
    const lengthAddress = shims.argument(2);
    if (lengthAddress !== 0n) engine.writeUint64(lengthAddress, 0n);
    shims.setResult(0n);
  });

  // Data symbols. errno is read through ___error; the stack guard value is
  // arbitrary but must stay put, since the guest compares it on return.
  const errno = shims.addData("guest.errno", new Uint8Array(8));
  shims.addAliases(["___error"], () => shims.setResult(errno));

  shims.addData(
    "___stack_chk_guard",
    new Uint8Array([0xa5, 0x71, 0x3c, 0xd9, 0x86, 0x42, 0xef, 0x10]),
  );

  for (const name of [
    "_kCFAllocatorDefault",
    "_kCFAllocatorNull",
    "_kDADiskDescriptionVolumeUUIDKey",
    "_kIOMasterPortDefault",
  ]) {
    shims.addData(name, new Uint8Array(8));
  }
}
