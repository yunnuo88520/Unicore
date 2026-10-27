// Author: yunnuo <ymz@ebox.vip>
// Description: ICO frame selection, legacy DIB transparency and corrupt container bounds.
package branding

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"image/png"
	"testing"
)

func wrapICO(size int, frames ...[]byte) []byte {
	out := make([]byte, 6+16*len(frames))
	binary.LittleEndian.PutUint16(out[2:4], 1)
	binary.LittleEndian.PutUint16(out[4:6], uint16(len(frames)))
	for i, frame := range frames {
		entry := out[6+16*i:]
		entry[0], entry[1] = byte(size), byte(size)
		binary.LittleEndian.PutUint16(entry[4:6], 1)
		binary.LittleEndian.PutUint16(entry[6:8], 32)
		binary.LittleEndian.PutUint32(entry[8:12], uint32(len(frame)))
		binary.LittleEndian.PutUint32(entry[12:16], uint32(len(out)))
		out = append(out, frame...)
	}
	return out
}

func TestICOFramesAndBounds(t *testing.T) {
	pngFrame, _ := base64.StdEncoding.DecodeString(imageInput(t, 32, 32, false))
	dib := make([]byte, 40+32*32*4+32*4)
	binary.LittleEndian.PutUint32(dib[:4], 40)
	binary.LittleEndian.PutUint32(dib[4:8], 32)
	binary.LittleEndian.PutUint32(dib[8:12], 64)
	binary.LittleEndian.PutUint16(dib[12:14], 1)
	binary.LittleEndian.PutUint16(dib[14:16], 32)
	for i := 40; i < 40+32*32*4; i += 4 {
		dib[i+2] = 255
	} // zero alpha legacy bitmap uses AND mask.
	dib[40+32*32*4+31*4] = 0x80 // transparent top-left pixel.
	for _, frame := range [][]byte{pngFrame, dib} {
		data, err := NormalizeIcon(base64.StdEncoding.EncodeToString(wrapICO(32, frame)))
		if err != nil {
			t.Fatal(err)
		}
		img, err := png.Decode(bytes.NewReader(data))
		if err != nil || img.Bounds().Dx() != 32 {
			t.Fatal("ICO did not normalize to PNG", err)
		}
		if bytes.Equal(frame, dib) {
			_, _, _, alpha := img.At(0, 0).RGBA()
			r, _, _, opaque := img.At(1, 0).RGBA()
			if alpha != 0 || r != 65535 || opaque != 65535 {
				t.Fatal("legacy AND transparency lost")
			}
		}
	}
	valid := wrapICO(32, pngFrame)
	badOffset := append([]byte{}, valid...)
	binary.LittleEndian.PutUint32(badOffset[18:22], 0xffffffff)
	badSize := append([]byte{}, valid...)
	binary.LittleEndian.PutUint32(badSize[14:18], 0xffffffff)
	badDimensions := append([]byte{}, valid...)
	badDimensions[6] = 64
	for _, raw := range [][]byte{valid[:21], badOffset, badSize, badDimensions, wrapICO(32, dib[:50]), wrapICO(32, []byte("<svg/>"))} {
		if _, err := NormalizeIcon(base64.StdEncoding.EncodeToString(raw)); err == nil {
			t.Fatal("invalid ICO accepted")
		}
	}
	if _, err := Normalize(base64.StdEncoding.EncodeToString(valid)); err == nil {
		t.Fatal("ICO accepted as site logo")
	}
}
