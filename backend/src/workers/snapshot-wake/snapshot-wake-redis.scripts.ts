/** Atomic pending-mailbox merge + monotonic version bump. */
export const ATOMIC_PENDING_WAKE_MERGE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
local existing = nil
local version = 0
if raw then
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and decoded then
    existing = decoded
    version = tonumber(existing.version) or 0
  end
end

local incoming_wake = cjson.decode(ARGV[1])
local existing_wake = existing and existing.wakeContext or nil

local function observed_ms(wake)
  if wake == nil or wake.providerObservedAt == nil or wake.providerObservedAt == cjson.null then
    return nil
  end
  return wake.providerObservedAt
end

local merged_wake = incoming_wake
if existing_wake ~= nil then
  local ex_obs = observed_ms(existing_wake)
  local in_obs = observed_ms(incoming_wake)
  if in_obs == nil or (ex_obs ~= nil and in_obs < ex_obs) then
    merged_wake = existing_wake
  elseif in_obs ~= nil and ex_obs ~= nil and in_obs == ex_obs then
    local ex_recv = existing_wake.receivedAt or ''
    local in_recv = incoming_wake.receivedAt or ''
    if in_recv < ex_recv then
      merged_wake = existing_wake
    else
      merged_wake = incoming_wake
    end
  else
    merged_wake = incoming_wake
  end
  local gen = tonumber(existing_wake.probeGeneration) or 0
  local in_gen = tonumber(incoming_wake.probeGeneration) or 0
  if in_gen < gen then
    merged_wake.probeGeneration = in_gen
  else
    merged_wake.probeGeneration = gen
  end
end

local record = {
  dimoTokenId = tonumber(ARGV[2]),
  wakeContext = merged_wake,
  updatedAtMs = tonumber(ARGV[3]),
  version = version + 1
}
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', tonumber(ARGV[4]))
return cjson.encode({ ok = true, version = record.version })
`;

/** Compare-and-delete pending wake for exact version ACK. */
export const ACK_PENDING_WAKE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local ok, record = pcall(cjson.decode, raw)
if not ok then return 0 end
if tonumber(record.version) == tonumber(ARGV[1]) then
  redis.call('DEL', KEYS[1])
  return 1
end
return 0
`;

/** Atomic successor merge: newest wake, earliest notBefore, monotonic version. */
export const ATOMIC_SUCCESSOR_HANDOFF_MERGE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
local existing = nil
local version = 0
if raw then
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and decoded then
    existing = decoded
    version = tonumber(existing.version) or 0
  end
end

local incoming = cjson.decode(ARGV[1])
local incoming_not_before = tonumber(incoming.notBeforeMs)
local merged = incoming
if existing ~= nil then
  local ex_not_before = tonumber(existing.notBeforeMs) or incoming_not_before
  if ex_not_before < incoming_not_before then
    merged.notBeforeMs = ex_not_before
  end
  local ex_wake = existing.wakeContext
  local in_wake = incoming.wakeContext
  local function observed_ms(wake)
    if wake == nil or wake.providerObservedAt == nil or wake.providerObservedAt == cjson.null then
      return nil
    end
    return wake.providerObservedAt
  end
  local ex_obs = observed_ms(ex_wake)
  local in_obs = observed_ms(in_wake)
  if in_obs == nil or (ex_obs ~= nil and in_obs < ex_obs) then
    merged.wakeContext = ex_wake
    merged.origin = existing.origin
  end
end
merged.version = version + 1
merged.updatedAtMs = tonumber(ARGV[2])
redis.call('SET', KEYS[1], cjson.encode(merged), 'EX', tonumber(ARGV[3]))
return cjson.encode({ ok = true, version = merged.version, notBeforeMs = merged.notBeforeMs })
`;

/** Compare-and-clear successor for exact processed version. */
export const ACK_SUCCESSOR_HANDOFF_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local ok, record = pcall(cjson.decode, raw)
if not ok then return 0 end
if tonumber(record.version) == tonumber(ARGV[1]) then
  redis.call('DEL', KEYS[1])
  return 1
end
return 0
`;
