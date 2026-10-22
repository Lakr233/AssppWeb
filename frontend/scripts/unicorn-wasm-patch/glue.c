/* JS-friendly Unicorn 2.x glue for emscripten.
 *
 * All 64-bit guest addresses cross the JS boundary as `double` (lossless for
 * integers < 2^53; SAP guest addresses stay below 2^48). Buffers are passed as
 * wasm-heap offsets allocated by JS via uc2_scratch_alloc.
 *
 * The code hook is registered in C; the C thunk converts the uint64 address to
 * double and forwards to a JS function pointer with signature (double, int),
 * avoiding i64-at-the-JS-boundary entirely.
 */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <unicorn/unicorn.h>
#include <emscripten.h>

typedef void (*js_hook_cb)(double address, int size);
typedef double (*js_mem_hook_cb)(double type, double address, double size, double value);


static js_hook_cb g_code_cb = NULL;

static void code_hook_thunk(uc_engine *uc, uint64_t address, uint32_t size, void *user_data)
{
    (void)uc;
    (void)user_data;
    if (g_code_cb != NULL) {
        g_code_cb((double)address, (int)size);
    }
}

double uc2_open(int arch, int mode)
{
    uc_engine *uc = NULL;
    if (uc_open((uc_arch)arch, (uc_mode)mode, &uc) != UC_ERR_OK) {
        return 0;
    }
    return (double)(uintptr_t)uc;
}

int uc2_close(double uc)
{
    return uc_close((uc_engine *)(uintptr_t)uc);
}

const char *uc2_strerror(int code)
{
    return uc_strerror((uc_err)code);
}

int uc2_version(int *major, int *minor)
{
    return uc_version(major, minor);
}

int uc2_mem_map(double uc, double address, double size)
{
    return uc_mem_map((uc_engine *)(uintptr_t)uc, (uint64_t)address, (size_t)size, UC_PROT_ALL);
}

int uc2_mem_unmap(double uc, double address, double size)
{
    return uc_mem_unmap((uc_engine *)(uintptr_t)uc, (uint64_t)address, (size_t)size);
}

int uc2_mem_protect(double uc, double address, double size, int perms)
{
    return uc_mem_protect((uc_engine *)(uintptr_t)uc, (uint64_t)address, (size_t)size, (uint32_t)perms);
}

int uc2_mem_write(double uc, double address, int buffer_offset, int length)
{
    uint8_t *base = (uint8_t *)malloc(length);
    if (base == NULL) {
        return -99;
    }
    memcpy(base, (uint8_t *)(uintptr_t)buffer_offset, (size_t)length);
    int rc = uc_mem_write((uc_engine *)(uintptr_t)uc, (uint64_t)address, base, (size_t)length);
    free(base);
    return rc;
}

int uc2_mem_read(double uc, double address, int buffer_offset, int length)
{
    return uc_mem_read((uc_engine *)(uintptr_t)uc, (uint64_t)address, (uint8_t *)(uintptr_t)buffer_offset, (size_t)length);
}

int uc2_reg_write(double uc, int regid, double value)
{
    uint64_t raw = (uint64_t)value;
    return uc_reg_write((uc_engine *)(uintptr_t)uc, regid, &raw);
}

double uc2_reg_read(double uc, int regid)
{
    uint64_t raw = 0;
    if (uc_reg_read((uc_engine *)(uintptr_t)uc, regid, &raw) != UC_ERR_OK) {
        return -1;
    }
    return (double)raw;
}

extern double tci_wasm_deadline_ms;

int uc2_emu_start(double uc, double begin, double until, double timeout_us, double count)
{
    if (timeout_us > 0) {
        tci_wasm_deadline_ms = emscripten_get_now() + timeout_us / 1000.0;
    } else {
        tci_wasm_deadline_ms = 0;
    }
    return uc_emu_start((uc_engine *)(uintptr_t)uc, (uint64_t)begin, (uint64_t)until, (uint64_t)timeout_us, (size_t)count);
}

int uc2_emu_stop(double uc)
{
    return uc_emu_stop((uc_engine *)(uintptr_t)uc);
}

double uc2_hook_add_code(double uc, double begin, double end)
{
    uc_hook handle = 0;
    if (uc_hook_add((uc_engine *)(uintptr_t)uc, &handle, UC_HOOK_CODE, (void *)code_hook_thunk, NULL,
                    (uint64_t)begin, (uint64_t)end) != UC_ERR_OK) {
        return 0;
    }
    return (double)(uintptr_t)handle;
}

int uc2_hook_del(double uc, double handle)
{
    return uc_hook_del((uc_engine *)(uintptr_t)uc, (uc_hook)(uintptr_t)handle);
}

void uc2_set_code_hook_cb(int fp_index)
{
    g_code_cb = (js_hook_cb)(uintptr_t)fp_index;
}

static js_mem_hook_cb g_mem_cb = NULL;

static int mem_invalid_thunk(uc_engine *uc, uc_mem_type type,
                             uint64_t address, int size, int64_t value,
                             void *user_data)
{
    (void)uc;
    (void)user_data;
    if (g_mem_cb != NULL) {
        return (int)g_mem_cb((double)type, (double)address, (double)size, (double)value);
    }
    return 0;
}

double uc2_hook_add_mem_invalid(double uc)
{
    uc_hook handle = 0;
    if (uc_hook_add((uc_engine *)(uintptr_t)uc, &handle, UC_HOOK_MEM_INVALID,
                    (void *)mem_invalid_thunk, NULL, 1, 0) != UC_ERR_OK) {
        return 0;
    }
    return (double)(uintptr_t)handle;
}

void uc2_set_mem_hook_cb(int fp_index)
{
    g_mem_cb = (js_mem_hook_cb)(uintptr_t)fp_index;
}

int uc2_scratch_alloc(int length)
{
    void *block = malloc((size_t)length);
    if (block == NULL) {
        return 0;
    }
    return (int)(uintptr_t)block;
}

void uc2_scratch_free(int offset)
{
    free((void *)(uintptr_t)offset);
}
