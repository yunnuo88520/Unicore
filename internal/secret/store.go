// Author: yunnuo <ymz@ebox.vip>
// Description: AES-256-GCM configuration encryption using an external/restricted key.
package secret

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

type Store struct {
	aead      cipher.AEAD
	digestKey []byte
}

func Open(directory, external string) (*Store, error) {
	var key []byte
	var err error
	if external != "" {
		key, err = base64.StdEncoding.DecodeString(external)
	} else {
		path := filepath.Join(directory, "secret.key")
		key, err = os.ReadFile(path)
		if errors.Is(err, os.ErrNotExist) {
			key = make([]byte, 32)
			if _, err = rand.Read(key); err != nil {
				return nil, err
			}
			if err = AtomicWrite(path, key); err != nil {
				return nil, err
			}
		}
	}
	if err != nil || len(key) != 32 {
		return nil, errors.New("secret key must contain exactly 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	derived := hmac.New(sha256.New, key)
	derived.Write([]byte("unicore.email.challenge.key.v1"))
	return &Store{aead: aead, digestKey: derived.Sum(nil)}, nil
}
func (s *Store) Seal(value string) string {
	nonce := make([]byte, s.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		panic(err)
	}
	return base64.StdEncoding.EncodeToString(s.aead.Seal(nonce, nonce, []byte(value), []byte("unicore.config.v1")))
}
func (s *Store) Open(value string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(value)
	if err != nil || len(raw) < s.aead.NonceSize() {
		return "", errors.New("invalid encrypted configuration")
	}
	plain, err := s.aead.Open(nil, raw[:s.aead.NonceSize()], raw[s.aead.NonceSize():], []byte("unicore.config.v1"))
	if err != nil {
		return "", errors.New("configuration key does not match")
	}
	return string(plain), nil
}

// AtomicWrite persists file contents before publishing an installation state.
func AtomicWrite(path string, data []byte) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".unicore-")
	if err != nil {
		return err
	}
	name := file.Name()
	defer os.Remove(name)
	if err = file.Chmod(0600); err == nil {
		_, err = file.Write(data)
	}
	if err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if err = os.Rename(name, path); err != nil {
		return err
	}
	// Some platforms do not support syncing directories; file data is already synced.
	if directory, err := os.Open(filepath.Dir(path)); err == nil {
		_ = directory.Sync()
		_ = directory.Close()
	}
	return nil
}
func ReadToken(value string) string { return strings.TrimSpace(value) }

// Digest binds low-entropy codes to the instance key and challenge context.
func (s *Store) Digest(value string) string {
	mac := hmac.New(sha256.New, s.digestKey)
	mac.Write([]byte(value))
	return hex.EncodeToString(mac.Sum(nil))
}
