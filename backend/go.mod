module github.com/rin2yh/go-tickets

go 1.27.1

require (
	github.com/clerk/clerk-sdk-go/v2 v2.7.0
	github.com/go-jose/go-jose/v3 v3.0.4
	github.com/syumai/workers-go v0.36.0
)

require golang.org/x/crypto v0.43.0 // indirect

tool github.com/syumai/workers-go/cmd/workers-assets-gen
