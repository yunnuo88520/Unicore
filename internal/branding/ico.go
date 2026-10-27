// Author: yunnuo <ymz@ebox.vip>
// Description: Bounded ICO decoding; persist pixels as PNG, never the uploaded container.
package branding

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
)

// NormalizeIcon accepts PNG/JPEG plus Windows icons containing PNG or BI_RGB DIB frames.
func NormalizeIcon(content string) ([]byte, error) {
	if len(content) > base64.StdEncoding.EncodedLen(MaxBytes) {
		return nil, ErrInvalid
	}
	raw, err := base64.StdEncoding.Strict().DecodeString(content)
	if err != nil || len(raw) > MaxBytes || len(raw) < 6 {
		return nil, ErrInvalid
	}
	if !bytes.Equal(raw[:4], []byte{0, 0, 1, 0}) {
		return Normalize(content)
	}
	count := int(binary.LittleEndian.Uint16(raw[4:6]))
	if count < 1 || count > 64 || len(raw) < 6+16*count {
		return nil, ErrInvalid
	}
	var frame []byte
	width, height := 0, 0
	for i := 0; i < count; i++ {
		entry := raw[6+16*i : 22+16*i]
		w, h := int(entry[0]), int(entry[1])
		if w == 0 {
			w = 256
		}
		if h == 0 {
			h = 256
		}
		size, offset := uint64(binary.LittleEndian.Uint32(entry[8:12])), uint64(binary.LittleEndian.Uint32(entry[12:16]))
		if entry[3] != 0 || size == 0 || offset < uint64(6+16*count) || offset+size > uint64(len(raw)) {
			return nil, ErrInvalid
		}
		if w >= 16 && h >= 16 && w*h > width*height {
			frame, width, height = raw[offset:offset+size], w, h
		}
	}
	if frame == nil {
		return nil, ErrInvalid
	}
	var src image.Image
	if bytes.HasPrefix(frame, []byte("\x89PNG\r\n\x1a\n")) {
		cfg, err := png.DecodeConfig(bytes.NewReader(frame))
		if err != nil || cfg.Width != width || cfg.Height != height {
			return nil, ErrInvalid
		}
		src, err = png.Decode(bytes.NewReader(frame))
		if err != nil {
			return nil, ErrInvalid
		}
	} else {
		src, err = decodeDIB(frame, width, height)
		if err != nil {
			return nil, err
		}
	}
	return encode(src, 256)
}

func decodeDIB(data []byte, width, height int) (image.Image, error) {
	// BITMAPINFOHEADER, bottom-up XOR pixels followed by a 1-bit AND transparency mask.
	if len(data) < 40 || binary.LittleEndian.Uint32(data[:4]) != 40 || int32(binary.LittleEndian.Uint32(data[4:8])) != int32(width) || int32(binary.LittleEndian.Uint32(data[8:12])) != int32(2*height) || binary.LittleEndian.Uint16(data[12:14]) != 1 || binary.LittleEndian.Uint32(data[16:20]) != 0 {
		return nil, ErrInvalid
	}
	bits := int(binary.LittleEndian.Uint16(data[14:16]))
	if bits != 1 && bits != 4 && bits != 8 && bits != 24 && bits != 32 {
		return nil, ErrInvalid
	}
	colors := 0
	if bits <= 8 {
		colors = int(binary.LittleEndian.Uint32(data[32:36]))
		if colors == 0 {
			colors = 1 << bits
		}
		if colors > 1<<bits {
			return nil, ErrInvalid
		}
	}
	start, stride, maskStride := 40+4*colors, ((width*bits+31)/32)*4, ((width+31)/32)*4
	maskStart := start + stride*height
	if len(data) < maskStart || (bits != 32 && len(data) < maskStart+maskStride*height) {
		return nil, ErrInvalid
	}
	hasMask := len(data) >= maskStart+maskStride*height
	img := image.NewNRGBA(image.Rect(0, 0, width, height))
	hasAlpha := false
	for y := 0; y < height; y++ {
		row := data[start+(height-1-y)*stride:]
		for x := 0; x < width; x++ {
			c := color.NRGBA{A: 255}
			if bits <= 8 {
				index := int(row[x*bits/8]>>(8-bits-(x*bits%8))) & ((1 << bits) - 1)
				if index >= colors {
					return nil, ErrInvalid
				}
				p := data[40+4*index:]
				c.R, c.G, c.B = p[2], p[1], p[0]
			} else {
				p := row[x*(bits/8):]
				c.R, c.G, c.B = p[2], p[1], p[0]
				if bits == 32 {
					c.A = p[3]
					hasAlpha = hasAlpha || c.A != 0
				}
			}
			img.SetNRGBA(x, y, c)
		}
	}
	if bits == 32 && !hasAlpha && !hasMask {
		return nil, ErrInvalid
	}
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			c := img.NRGBAAt(x, y)
			if bits == 32 && !hasAlpha {
				c.A = 255
			}
			if hasMask && data[maskStart+(height-1-y)*maskStride+x/8]&(0x80>>uint(x%8)) != 0 {
				c.A = 0
			}
			img.SetNRGBA(x, y, c)
		}
	}
	return img, nil
}
