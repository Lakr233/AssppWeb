/// Wisp protocol packet types.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum WispPacketType {
  Connect = 0x01,
  Data = 0x02,
  Continue = 0x03,
  Close = 0x04,
}

impl WispPacketType {
  pub fn from_u8(val: u8) -> Option<Self> {
    match val {
      0x01 => Some(Self::Connect),
      0x02 => Some(Self::Data),
      0x03 => Some(Self::Continue),
      0x04 => Some(Self::Close),
      _ => None,
    }
  }
}

/// Wisp stream type.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum StreamType {
  Tcp = 0x01,
  Udp = 0x02,
}

impl StreamType {
  pub fn from_u8(val: u8) -> Option<Self> {
    match val {
      0x01 => Some(Self::Tcp),
      0x02 => Some(Self::Udp),
      _ => None,
    }
  }
}

/// Wisp close reason codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum CloseReason {
  Unknown = 0x01,
  Voluntary = 0x02,
  NetworkError = 0x03,
  InvalidData = 0x04,
  Forbidden = 0x05,
  Timeout = 0x06,
  ServerRefused = 0x41,
  ServerUnreachable = 0x42,
  HostUnreachable = 0x43,
  ConnectionTimedOut = 0x44,
  ConnectionResetByPeer = 0x45,
  ConnectionRefused = 0x47,
}

/// Parsed Wisp CONNECT packet payload.
#[derive(Debug, Clone)]
pub struct ConnectPayload {
  pub stream_type: StreamType,
  pub port: u16,
  pub hostname: String,
}

/// Parse a Wisp packet from raw bytes.
/// Returns (packet_type, stream_id, payload).
pub fn parse_packet(data: &[u8]) -> Option<(WispPacketType, u32, &[u8])> {
  if data.len() < 5 {
    return None;
  }

  let packet_type = WispPacketType::from_u8(data[0])?;
  let stream_id = u32::from_le_bytes([data[1], data[2], data[3], data[4]]);
  let payload = &data[5..];

  Some((packet_type, stream_id, payload))
}

/// Parse a CONNECT packet payload.
pub fn parse_connect(payload: &[u8]) -> Option<ConnectPayload> {
  if payload.len() < 4 {
    return None;
  }

  let stream_type = StreamType::from_u8(payload[0])?;
  let port = u16::from_le_bytes([payload[1], payload[2]]);
  let hostname = std::str::from_utf8(&payload[3..]).ok()?.to_string();

  Some(ConnectPayload {
    stream_type,
    port,
    hostname,
  })
}

/// Serialize a DATA packet.
pub fn make_data_packet(stream_id: u32, data: &[u8]) -> Vec<u8> {
  let mut packet = Vec::with_capacity(5 + data.len());
  packet.push(WispPacketType::Data as u8);
  packet.extend_from_slice(&stream_id.to_le_bytes());
  packet.extend_from_slice(data);
  packet
}

/// Serialize a CONTINUE packet.
pub fn make_continue_packet(stream_id: u32, buffer_remaining: u32) -> Vec<u8> {
  let mut packet = Vec::with_capacity(9);
  packet.push(WispPacketType::Continue as u8);
  packet.extend_from_slice(&stream_id.to_le_bytes());
  packet.extend_from_slice(&buffer_remaining.to_le_bytes());
  packet
}

/// Serialize a CLOSE packet.
pub fn make_close_packet(stream_id: u32, reason: CloseReason) -> Vec<u8> {
  let mut packet = Vec::with_capacity(6);
  packet.push(WispPacketType::Close as u8);
  packet.extend_from_slice(&stream_id.to_le_bytes());
  packet.push(reason as u8);
  packet
}

// --- Host validation ---

const STATIC_WHITELIST: &[&str] = &[
  "auth.itunes.apple.com",
  "buy.itunes.apple.com",
  "init.itunes.apple.com",
];

/// Check if hostname matches the pod-based pattern `p{digits}-buy.itunes.apple.com`.
fn is_pod_host(hostname: &str) -> bool {
  let Some(rest) = hostname.strip_prefix('p') else {
    return false;
  };
  let Some(idx) = rest.find('-') else {
    return false;
  };
  let digits = &rest[..idx];
  !digits.is_empty()
    && digits.chars().all(|c| c.is_ascii_digit())
    && rest[idx..] == *"-buy.itunes.apple.com"
}

/// Validate a Wisp CONNECT target against the security policy.
/// Returns an error message if the target is not allowed.
pub fn validate_wisp_target(hostname: &str, port: u16) -> Result<(), String> {
  // Port must be 443
  if port != 443 {
    return Err(format!("Port {} is not allowed (only 443)", port));
  }

  // Block direct IP targets
  if is_ip_address(hostname) {
    return Err("Direct IP targets are not allowed".into());
  }

  // Block loopback
  if is_loopback(hostname) {
    return Err("Loopback targets are not allowed".into());
  }

  // Check hostname whitelist
  if !STATIC_WHITELIST.contains(&hostname) && !is_pod_host(hostname) {
    return Err(format!("Hostname {} is not in the whitelist", hostname));
  }

  Ok(())
}

fn is_ip_address(host: &str) -> bool {
  host.parse::<std::net::Ipv4Addr>().is_ok() || host.parse::<std::net::Ipv6Addr>().is_ok()
}

fn is_loopback(host: &str) -> bool {
  host == "localhost"
    || host == "127.0.0.1"
    || host == "::1"
    || host == "[::1]"
    || host.ends_with(".localhost")
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_parse_packet() {
    let mut data = vec![0x01]; // CONNECT
    data.extend_from_slice(&1u32.to_le_bytes()); // stream_id = 1
    data.extend_from_slice(b"payload");

    let (ptype, stream_id, payload) = parse_packet(&data).unwrap();
    assert_eq!(ptype, WispPacketType::Connect);
    assert_eq!(stream_id, 1);
    assert_eq!(payload, b"payload");
  }

  #[test]
  fn test_parse_packet_too_short() {
    assert!(parse_packet(&[0x01, 0x00]).is_none());
  }

  #[test]
  fn test_parse_connect() {
    let mut payload = vec![0x01]; // TCP
    payload.extend_from_slice(&443u16.to_le_bytes()); // port
    payload.extend_from_slice(b"buy.itunes.apple.com");

    let conn = parse_connect(&payload).unwrap();
    assert_eq!(conn.stream_type, StreamType::Tcp);
    assert_eq!(conn.port, 443);
    assert_eq!(conn.hostname, "buy.itunes.apple.com");
  }

  #[test]
  fn test_make_data_packet() {
    let packet = make_data_packet(42, b"hello");
    assert_eq!(packet[0], WispPacketType::Data as u8);
    let stream_id = u32::from_le_bytes([packet[1], packet[2], packet[3], packet[4]]);
    assert_eq!(stream_id, 42);
    assert_eq!(&packet[5..], b"hello");
  }

  #[test]
  fn test_make_continue_packet() {
    let packet = make_continue_packet(1, 1024);
    assert_eq!(packet[0], WispPacketType::Continue as u8);
    let remaining = u32::from_le_bytes([packet[5], packet[6], packet[7], packet[8]]);
    assert_eq!(remaining, 1024);
  }

  #[test]
  fn test_make_close_packet() {
    let packet = make_close_packet(1, CloseReason::Voluntary);
    assert_eq!(packet[0], WispPacketType::Close as u8);
    assert_eq!(packet[5], CloseReason::Voluntary as u8);
  }

  #[test]
  fn test_validate_wisp_target_allowed() {
    assert!(validate_wisp_target("auth.itunes.apple.com", 443).is_ok());
    assert!(validate_wisp_target("buy.itunes.apple.com", 443).is_ok());
    assert!(validate_wisp_target("init.itunes.apple.com", 443).is_ok());
    assert!(validate_wisp_target("p25-buy.itunes.apple.com", 443).is_ok());
    assert!(validate_wisp_target("p1-buy.itunes.apple.com", 443).is_ok());
    assert!(validate_wisp_target("p999-buy.itunes.apple.com", 443).is_ok());
  }

  #[test]
  fn test_validate_wisp_target_wrong_port() {
    let err = validate_wisp_target("buy.itunes.apple.com", 80).unwrap_err();
    assert!(err.contains("443"));
  }

  #[test]
  fn test_validate_wisp_target_blocked_host() {
    assert!(validate_wisp_target("evil.com", 443).is_err());
    assert!(validate_wisp_target("apple.com", 443).is_err()); // not in whitelist
  }

  #[test]
  fn test_validate_wisp_target_ip_blocked() {
    assert!(validate_wisp_target("1.2.3.4", 443).is_err());
    assert!(validate_wisp_target("::1", 443).is_err());
  }

  #[test]
  fn test_validate_wisp_target_loopback_blocked() {
    assert!(validate_wisp_target("localhost", 443).is_err());
    assert!(validate_wisp_target("127.0.0.1", 443).is_err());
  }

  #[test]
  fn test_roundtrip_data_packet() {
    let packet = make_data_packet(7, b"test data");
    let (ptype, stream_id, payload) = parse_packet(&packet).unwrap();
    assert_eq!(ptype, WispPacketType::Data);
    assert_eq!(stream_id, 7);
    assert_eq!(payload, b"test data");
  }
}
