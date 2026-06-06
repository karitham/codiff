{
  description = "Codiff - A beautiful, minimal, local diff viewer for reviewing staged and unstaged Git changes before committing";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs =
    inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      perSystem =
        { pkgs, ... }:
        let
          codiff = pkgs.stdenv.mkDerivation (finalAttrs: {
            pname = "codiff";
            version = "1.1.0";
            outputs = [
              "out"
              "lib"
            ];

            src = ./.;

            pnpmDeps = pkgs.fetchPnpmDeps {
              pname = "${finalAttrs.pname}-pnpm-deps";
              inherit (finalAttrs) version src;
              fetcherVersion = 3;
              hash = "sha256-wyivubILGVGcgryizwX41t6zbUNWKz/s9ssrj271EJ4=";
            };

            env = {
              ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
              SSL_CERT_FILE = "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
              CI = "true";
            };

            nativeBuildInputs = [
              pkgs.pnpmConfigHook
              pkgs.makeWrapper
            ];

            buildInputs = [
              pkgs.nodejs
              pkgs.pnpm
              pkgs.git
            ];

            buildPhase = ''
              runHook preBuild
              pnpm rebuild @swc/core @tailwindcss/oxide
              pnpm exec vp build
              runHook postBuild
            '';

            doCheck = true;
            checkPhase = ''
              runHook preCheck
              pnpm test
              runHook postCheck
            '';

            installPhase = ''
              runHook preInstall

              mkdir -p $out/lib/codiff $out/bin
              # Only copy runtime essentials: bin/, dist/, node_modules/, package.json
              cp -r bin dist node_modules package.json $out/lib/codiff/

              printf 'electron' > $out/lib/codiff/node_modules/electron/path.txt

              makeWrapper ${pkgs.lib.getExe pkgs.nodejs} $out/bin/codiff \
                --set ELECTRON_OVERRIDE_DIST_PATH ${pkgs.electron}/bin \
                --add-flags $out/lib/codiff/bin/codiff.js

              install -Dm644 electron/icons/icon.png $out/share/icons/hicolor/1024x1024/apps/codiff.png
              mkdir -p $out/share/applications
              cat > $out/share/applications/codiff.desktop <<EOF
              [Desktop Entry]
              Type=Application
              Name=Codiff
              Comment=Fast local diff viewer
              Exec=codiff %U
              Icon=$out/share/icons/hicolor/1024x1024/apps/codiff.png
              Categories=Development;Utility
              Terminal=false
              StartupNotify=true
              EOF

              mkdir -p $lib
              cp -r opencode claude codex $lib/

              runHook postInstall
            '';

            meta = with pkgs.lib; {
              description = "Fast local diff viewer";
              homepage = "https://github.com/nkzw-tech/codiff";
              license = licenses.mit;
              mainProgram = "codiff";
              platforms = platforms.all;
            };
          });
        in
        {
          packages.default = codiff;

          devShells.default = pkgs.mkShell {
            buildInputs = with pkgs; [
              nodejs_24
              pnpm
              electron
              oxfmt
              oxlint
            ];

            shellHook = ''
              echo "Codiff development shell"
              echo "Available commands:"
              echo "  pnpm install    - Install dependencies"
              echo "  pnpm test       - Run tests"
              echo "  pnpm exec vp build  - Build the app"
              echo "  pnpm dev        - Start development mode"
              echo "  pnpm package:app - Package for distribution"
            '';
          };
        };
    };
}
