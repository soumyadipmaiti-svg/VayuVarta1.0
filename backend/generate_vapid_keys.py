"""
WeatherGPT — VAPID Key Generator for Web Push Notifications
Run this ONCE to generate your VAPID key pair, then add to .env.

Usage:
  python generate_vapid_keys.py

Copy the output into your .env file:
  VAPID_PRIVATE_KEY=...
  VAPID_PUBLIC_KEY=...
  VAPID_EMAIL=mailto:your@email.com
"""

import base64
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization


def main():
    print("Generating VAPID key pair for Web Push Notifications...")
    print("=" * 60)

    # Generate EC private key on SECP256R1 curve
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()

    # Private key as PEM
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    # Public key as uncompressed point (base64url) for VAPID
    public_numbers = public_key.public_numbers()
    x = public_numbers.x.to_bytes(32, byteorder="big")
    y = public_numbers.y.to_bytes(32, byteorder="big")
    public_key_b64 = base64.urlsafe_b64encode(b"\x04" + x + y).rstrip(b"=").decode("utf-8")

    print("\nAdd these to your .env file:\n")
    print(f"VAPID_PRIVATE_KEY={private_pem.strip()}")
    print(f"VAPID_PUBLIC_KEY={public_key_b64}")
    print(f"VAPID_EMAIL=mailto:your@email.com")
    print("\n" + "=" * 60)
    print("\nThe VAPID_PUBLIC_KEY goes in the frontend too:")
    print(f"  const VAPID_PUBLIC_KEY = '{public_key_b64}';")
    print("\nKeep VAPID_PRIVATE_KEY secret — never expose to the frontend!")


if __name__ == "__main__":
    main()
